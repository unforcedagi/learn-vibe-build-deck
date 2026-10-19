"""Render the course calendar from schedule/semester.json.

Writes the generated blocks in:
  index.html                  "This week" block and the term path
  schedule/index.html         the "This week" block and the table rows
  worker/src/weeks.generated.js  the Worker's WEEKS (submission calendar)
build_lessons.py reads the same file for each lesson's slide link.

The current week is the latest class meeting on or before today in Denver,
so the output changes on its own each Monday. .github/workflows/schedule.yml
runs this daily and commits when the week changes.

Run from anywhere (stdlib only):
  python3 tools/build_schedule.py              write the files for today
  python3 tools/build_schedule.py --check      exit 1 if a file is out of date
  python3 tools/build_schedule.py --date 2026-10-26   render as of a given day
"""
import argparse, datetime as dt, html, json, re, sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "schedule" / "semester.json"
WEEKS_JS = ROOT / "worker" / "src" / "weeks.generated.js"
KINDS = {"lesson", "studio", "guest", "demos", "no-class"}
RUNWAY_DAYS = 14


def esc(text):
    return html.escape(text, quote=False)


def load():
    return json.loads(SOURCE.read_text())


def classes(sem):
    return [m for m in sem["meetings"] if m["kind"] != "no-class"]


def today_local(sem, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    return now.astimezone(ZoneInfo(sem["term"]["timezone"])).date()


def current_meeting(sem, today):
    """The latest class on or before today; the first class before term starts."""
    past = [m for m in classes(sem) if dt.date.fromisoformat(m["date"]) <= today]
    return past[-1] if past else classes(sem)[0]


def canvas_url(sem, assignment):
    return f'{sem["term"]["canvas_course"]}/assignments/{assignment["canvas_id"]}'


def short_date(day):
    return f"{day:%b} {day.day}"


def row_date(day):
    return short_date(day) + ("" if day.weekday() == 0 else f" ({day:%a})")


def due_local(sem, assignment):
    return dt.datetime.fromisoformat(assignment["due_at"].replace("Z", "+00:00")).astimezone(
        ZoneInfo(sem["term"]["timezone"]))


def clock(t):
    return f"{t:%I:%M %p}".lstrip("0")


# --- home page -------------------------------------------------------------

def home_task(sem, m, n, task):
    a = m.get("assignment")
    lines = [f'      <div class="brief-task">',
             f'        <p class="kicker">{n:02d} / {esc(task["label"])}</p>',
             f'        <h3>{esc(task["title"])}</h3>',
             f'        <p>{esc(task["body"])}</p>']
    if task.get("submit") and a:
        due = due_local(sem, a)
        lines += [f'        <div class="due">Due {due:%A}, {due:%B} {due.day} · {clock(due)} MT</div>',
                  '        <a href="account/">Submit in your account <span aria-hidden="true">&nbsp;↗</span></a>',
                  f'        <span aria-hidden="true"> · </span><a href="{canvas_url(sem, a)}">or Canvas</a>']
    if task.get("link"):
        lines.append(f'        <a href="{task["link"]["href"]}">{esc(task["link"]["text"])} <span aria-hidden="true">&nbsp;↗</span></a>')
    return lines + ['      </div>']


def default_tasks(m):
    """Tasks when the week has none written yet: its assignment, or the schedule."""
    a = m.get("assignment")
    if a:
        return [{"label": "This week's work", "title": a["title"], "body": a["prompt"], "submit": True}]
    return [{"label": "In class", "title": m["covers"], "body": m["summary"],
             "link": {"href": f'schedule/#week-{m["week"]}', "text": "See the schedule"}}]


def home_brief(sem, m):
    day = dt.date.fromisoformat(m["date"])
    if m.get("lesson"):
        buttons = f'<a class="btn" href="{m["lesson"]}">Everything for Week {m["week"]} <span aria-hidden="true">→</span></a>'
    else:
        buttons = f'<a class="btn" href="schedule/#week-{m["week"]}">Week {m["week"]} on the schedule <span aria-hidden="true">→</span></a>'
    if m.get("slides"):
        buttons += f' <a class="btn" href="{m["slides"]}">Slides</a>'
    lines = ['  <section class="week-brief" aria-labelledby="this-week-title">',
             '    <div class="brief-lesson">',
             f'      <p class="kicker">This week / {m["week"]:02d} / {day:%B} {day.day}</p>',
             f'      <h2 id="this-week-title">{esc(m["title"])}</h2>',
             f'      <p>{esc(m["summary"])}</p>',
             f'      {buttons}',
             '    </div>',
             '    <div class="brief-tasks">']
    for n, task in enumerate(m.get("tasks") or default_tasks(m), 1):
        lines += home_task(sem, m, n, task)
    return "\n".join(lines + ['    </div>', '  </section>'])


def term_path(sem, current):
    lines = ['    <div class="term-preview">']
    for m in classes(sem):
        if m["date"] > current["date"]:
            break
        href = m.get("lesson") or f'schedule/#week-{m["week"]}'
        active = m is current
        label = "This week" if active else esc(m["tag"])
        lines.append(f'      <a class="term-week{" active" if active else ""}" href="{href}"><span class="number">{m["week"]:02d}</span>'
                     f'<strong>{esc(m["title"])}</strong><small>{short_date(dt.date.fromisoformat(m["date"]))} · {label}</small></a>')
    return "\n".join(lines + ['    </div>'])


# --- schedule page ---------------------------------------------------------

def schedule_now(sem, m):
    day = dt.date.fromisoformat(m["date"])
    lines = ['  <div class="now">',
             f'    <div class="eyebrow">This week &mdash; Week {m["week"]} &middot; {short_date(day)}</div>',
             f'    <h2>{esc(m.get("headline") or m["title"])}</h2>',
             f'    <p>{esc(m.get("plan") or m["summary"])}</p>']
    a = m.get("assignment")
    if a:
        due = due_local(sem, a)
        work = m.get("work") or a["title"].lower()
        lines.append(f'    <p>Weekly work: {esc(work)}. Due {due:%A %b} {due.day}, {clock(due)}. Submit through your account or the '
                     f'<a href="{canvas_url(sem, a)}">Week {m["week"]} assignment on Canvas</a>.</p>')
    buttons = []
    if m.get("lesson"):
        buttons += [f'      <a class="btn" href="../{m["lesson"]}">Read the lesson</a>',
                    f'      <a class="btn ghost" href="../{m["lesson"]}lesson.md">Lesson as markdown</a>']
    if m.get("slides"):
        buttons.append(f'      <a class="btn ghost" href="../{m["slides"]}">Slides</a>')
    if buttons:
        lines += ['    <div class="copybar">', *buttons, '    </div>']
    return "\n".join(lines + ['  </div>'])


def schedule_rows(sem, current):
    rows = []
    for m in sem["meetings"]:
        day = dt.date.fromisoformat(m["date"])
        if m["kind"] == "no-class":
            rows += ['      <tr class="no-class">', '        <td class="week">&mdash;</td>',
                     f'        <td class="date">{row_date(day)}</td>', f'        <td colspan="3">{esc(m["covers"])}</td>', '      </tr>']
            continue
        due = esc(m.get("due") or "—")
        # Canvas links appear once a week arrives; future assignments are often unpublished.
        if m.get("assignment") and m["date"] <= current["date"]:
            due += f' (<a href="{canvas_url(sem, m["assignment"])}">Canvas</a>)'
        links = []
        if m.get("lesson"):
            links.append(f'<a href="../{m["lesson"]}">Lesson .md</a>')
        if m.get("slides"):
            links.append(f'<a href="../{m["slides"]}">{"Slides PDF" if m["slides"].endswith(".pdf") else "Slides"}</a>')
        materials = (f'<span class="week-links">{" ".join(links)}</span>' if links
                     else f'<span class="hint">{esc(m.get("materials_note", "Brief added that week"))}</span>')
        current_class = ' class="current"' if m is current else ""
        rows += [f'      <tr id="week-{m["week"]}"{current_class}>',
                 f'        <td class="week">{m["week"]}</td>',
                 f'        <td class="date" data-label="Date">{row_date(day)}</td>',
                 f'        <td data-label="Covers">{esc(m["covers"])}</td>',
                 f'        <td data-label="Due">{due}</td>',
                 f'        <td data-label="Materials">{materials}</td>',
                 '      </tr>']
    return "\n".join(rows)


# --- worker ----------------------------------------------------------------

def worker_weeks(sem):
    weeks = [{"week": m["week"], "title": m["assignment"]["title"], "due_at": m["assignment"]["due_at"],
              "canvas_url": canvas_url(sem, m["assignment"]), "prompt": m["assignment"]["prompt"]}
             for m in classes(sem) if m.get("assignment")]
    body = ",\n".join("  " + json.dumps(w, ensure_ascii=False) for w in weeks)
    return ("// Generated by tools/build_schedule.py from schedule/semester.json. Do not edit:\n"
            "// change semester.json and run `python3 tools/build_schedule.py`.\n"
            f"export const WEEKS = [\n{body},\n];\n")


# --- files -----------------------------------------------------------------

def replace_block(text, name, content, path):
    pattern = re.compile(rf'(<!-- generated:{name} [^>]*-->\n).*?(\n *<!-- /generated:{name} -->)', re.S)
    if not pattern.search(text):
        sys.exit(f"{path}: missing <!-- generated:{name} --> markers")
    return pattern.sub(lambda mt: mt.group(1) + content + mt.group(2), text, count=1)


def read(path):
    path = ROOT / path
    return path.read_text() if path.exists() else ""


def render(sem, today):
    current = current_meeting(sem, today)
    out = {}
    home = (ROOT / "index.html").read_text()
    home = replace_block(home, "this-week", home_brief(sem, current), "index.html")
    out["index.html"] = replace_block(home, "term-path", term_path(sem, current), "index.html")
    sched = (ROOT / "schedule/index.html").read_text()
    sched = replace_block(sched, "this-week", schedule_now(sem, current), "schedule/index.html")
    out["schedule/index.html"] = replace_block(sched, "rows", schedule_rows(sem, current), "schedule/index.html")
    out["worker/src/weeks.generated.js"] = worker_weeks(sem)
    return out


def validate(sem, today):
    """Problems with semester.json itself. Returns a list of messages."""
    problems, seen = [], set()
    dates = [m["date"] for m in sem["meetings"]]
    if dates != sorted(dates):
        problems.append("meetings are not in date order")
    for m in sem["meetings"]:
        where = f'{m["date"]} (week {m.get("week", "-")})'
        if m["kind"] not in KINDS:
            problems.append(f"{where}: unknown kind {m['kind']!r}")
        if m["kind"] == "no-class":
            continue
        for key in ("week", "title", "tag", "summary", "covers"):
            if not m.get(key):
                problems.append(f"{where}: missing {key}")
        if m.get("week") in seen:
            problems.append(f"{where}: week number repeats")
        seen.add(m.get("week"))
        for key in ("lesson", "slides"):
            if m.get(key) and not (ROOT / m[key]).exists():
                problems.append(f"{where}: {key} path {m[key]} does not exist")
        if "assignment" not in m:
            problems.append(f'{where}: missing assignment (write "assignment": null if the week has no weekly submission)')
        a = m.get("assignment")
        if a:
            for key in ("title", "due_at", "canvas_id", "prompt"):
                if not a.get(key):
                    problems.append(f"{where}: assignment missing {key}")
            if a.get("due_at") and not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", a["due_at"]):
                problems.append(f"{where}: due_at must be ISO UTC like 2026-10-26T05:59:00Z")
        for task in m.get("tasks") or []:
            if task.get("submit") and not a:
                problems.append(f"{where}: a submit task needs an assignment")
    for src in sorted((ROOT / "lessons/src").glob("week-*.md")):
        week = int(re.search(r"week-(\d+)", src.name).group(1))
        if not any(m.get("week") == week and m.get("lesson") == f"lessons/week-{week}/" for m in sem["meetings"]):
            problems.append(f"lessons/src/{src.name} exists but week {week} has no \"lesson\": \"lessons/week-{week}/\"")
    # Runway: the calendar must reach two weeks ahead, or to the last day of term.
    last = dt.date.fromisoformat(dates[-1])
    need = min(today + dt.timedelta(days=RUNWAY_DAYS), dt.date.fromisoformat(sem["term"]["last_day"]))
    if last < need:
        problems.append(f"the calendar ends {last}; add meetings through at least {need}")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="exit 1 if semester.json is invalid or a file is out of date")
    parser.add_argument("--date", type=dt.date.fromisoformat, help="render as of this day (YYYY-MM-DD, Denver)")
    args = parser.parse_args()
    sem = load()
    now = dt.datetime.now(dt.timezone.utc)
    today = args.date or today_local(sem, now)
    problems = validate(sem, today)
    if problems:
        sys.exit("semester.json:\n  " + "\n  ".join(problems))
    out = render(sem, today)
    if args.check:
        # The daily workflow flips the week a little after midnight; accept the
        # previous day's render for a few hours so a push at 00:30 isn't red.
        earlier = None if args.date else render(sem, today_local(sem, now - dt.timedelta(hours=6)))
        stale = [p for p, text in out.items() if read(p) != text
                 and not (earlier and read(p) == earlier[p])]
        if stale:
            sys.exit("out of date (run python3 tools/build_schedule.py): " + ", ".join(stale))
        print(f"schedule up to date (current week {current_meeting(sem, today)['week']})")
        return
    changed = [p for p, text in out.items() if read(p) != text]
    for p in changed:
        (ROOT / p).write_text(out[p])
    print(f"current week {current_meeting(sem, today)['week']}; updated: {', '.join(changed) or 'nothing'}")


if __name__ == "__main__":
    main()
