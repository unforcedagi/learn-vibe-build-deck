"""Build the Lessons section from lessons/src/week-N.md.

For each lesson it writes:
  lessons/week-N/index.html   readable page with a "Copy lesson" button
  lessons/week-N/lesson.md    the raw markdown (what students paste into an AI)
It also writes:
  lessons/index.html          the list of lessons
  lessons/index.md            a markdown index file (a map an AI can navigate)
  llms.txt                    the site-wide map for AI tools (llmstxt.org convention)

Run from the repo root:
  uv run -q --no-project --with markdown python tools/build_lessons.py
"""
import glob, html, os, re
import markdown

SITE = "https://cu.learnvibe.build"
DECKS = {1: "slides/first-class/", 2: "slides/week-2/lite/", 3: "slides/week-3/"}
NAV = [("schedule/", "Schedule"), ("lessons/", "Lessons"), ("syllabus.html", "Syllabus"),
       ("setup/", "Setup"), ("studio/", "Studio"), ("journal/", "Journal"), ("account/", "Account")]


def nav(prefix, current):
    links = "\n".join(
        f'      <a href="{prefix}{href}"{" aria-current=\"page\"" if label == current else ""}>{label}</a>'
        for href, label in NAV)
    return f'''<header class="site-nav">
  <div class="site-nav-inner">
    <a class="brand" href="{prefix}">Learn, Vibe, Build</a>
    <nav>
{links}
    </nav>
  </div>
</header>'''


def page(title, prefix, body, current="Lessons"):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} — Learn, Vibe, Build · ATLS 4519</title>
<link rel="stylesheet" href="{prefix}assets/site.css">
</head>
<body>
{nav(prefix, current)}
<main class="lesson-main">
{body}
</main>
</body>
</html>
'''


COPY_JS = '''<script>
document.querySelectorAll('[data-copy]').forEach(function (b) {
  b.addEventListener('click', function () {
    fetch(b.getAttribute('data-copy')).then(function (r) { return r.text(); }).then(function (t) {
      return navigator.clipboard.writeText(t);
    }).then(function () {
      var old = b.textContent; b.textContent = 'Copied ✓';
      setTimeout(function () { b.textContent = old; }, 1800);
    }).catch(function () { location.href = b.getAttribute('data-copy'); });
  });
});
</script>'''


def lesson_meta(src):
    text = open(src).read()
    title = re.search(r"^# (.+)$", text, re.M).group(1).strip()
    line = re.search(r"^\*\*In one line:\*\* (.+)$", text, re.M)
    if not line:
        line = re.search(r"^\*\*Through-line for today:\*\* (.+)$", text, re.M)
    summary = re.sub(r"[*_]", "", line.group(1)).strip() if line else ""
    week = int(re.search(r"week-(\d+)\.md$", src).group(1))
    return week, title, summary, text


def main():
    lessons = sorted((lesson_meta(f) for f in glob.glob("lessons/src/week-*.md")), key=lambda x: x[0])
    for week, title, summary, text in lessons:
        out = f"lessons/week-{week}"
        os.makedirs(out, exist_ok=True)
        open(f"{out}/lesson.md", "w").write(text)
        body_md = re.sub(r"^# .+\n", "", text, count=1)
        rendered = markdown.markdown(body_md, extensions=["tables", "fenced_code", "toc", "sane_lists"])
        # Autolink bare URLs outside code and existing links.
        parts = re.split(r"(<pre.*?</pre>|<code>.*?</code>|<a [^>]*>.*?</a>)", rendered, flags=re.S)
        rendered = "".join(p if i % 2 else re.sub(r"(https?://[^\s<)]+[^\s<).,;:])", r'<a href="\1">\1</a>', p)
                           for i, p in enumerate(parts))
        deck = DECKS.get(week)
        deck_link = f' <a class="btn ghost" href="../../{deck}">Open the slides</a>' if deck else ""
        body = f'''  <p class="crumb"><a href="../">Lessons</a> · Week {week}</p>
  <h1>{html.escape(title)}</h1>
  <div class="copybar">
    <button class="btn" type="button" data-copy="lesson.md">Copy lesson as markdown</button>
    <a class="btn ghost" href="lesson.md">View raw .md</a>{deck_link}
  </div>
  <p class="hint">Paste the copied lesson into any AI (Claude, ChatGPT, Gemini, a local model) and ask it to teach you more.
    Or point your AI at <code>{SITE}/lessons/week-{week}/lesson.md</code>.</p>
  <article class="lesson">
{rendered}
  </article>
{COPY_JS}'''
        open(f"{out}/index.html", "w").write(page(title, "../../", body))

    # Lessons index (HTML)
    cards = "\n".join(
        f'''    <a class="card" href="week-{w}/">
      <p class="kicker">Week {w}</p>
      <h2>{html.escape(t.split("—", 1)[-1].strip())}</h2>
      <p>{html.escape(s)}</p>
    </a>''' for w, t, s, _ in reversed(lessons))
    body = f'''  <h1>Lessons</h1>
  <p class="lead">Every lesson, as a page you can read and as a markdown file you can hand to your AI.
    Copy a lesson, paste it into Claude, ChatGPT or any other assistant, and ask it to explain, quiz you,
    or apply it to your project.</p>
  <div class="copybar">
    <button class="btn" type="button" data-copy="index.md">Copy the course map</button>
    <a class="btn ghost" href="index.md">index.md</a>
    <a class="btn ghost" href="../llms.txt">llms.txt</a>
  </div>
  <p class="hint">Using an AI that can read web pages? Give it <code>{SITE}/llms.txt</code>.
    It's a short map of the whole course with links to every lesson's markdown. That's the index-file idea from Week 6.</p>
  <div class="cards">
{cards}
  </div>
{COPY_JS}'''
    open("lessons/index.html", "w").write(page("Lessons", "../", body))

    # Lessons index (markdown): the map an AI reads first
    lines = ["# Learn, Vibe, Build — lessons index", "",
             "ATLS 4519 · CU Boulder · Fall 2026 · Aaron Neyer. Each lesson is a separate markdown file; open only what you need.", ""]
    for w, t, s, _ in lessons:
        lines.append(f"- [{t}]({SITE}/lessons/week-{w}/lesson.md): {s}")
    lines += ["", "Also: [syllabus]({0}/SYLLABUS_DRAFT.md) · [schedule]({0}/schedule/) · [setup]({0}/setup/) · [tools]({0}/studio/tools.html)".format(SITE), ""]
    open("lessons/index.md", "w").write("\n".join(lines))

    # llms.txt at the site root
    llms = ["# Learn, Vibe, Build", "",
            "> ATLS 4519, a CU Boulder studio course about becoming a builder with AI (Fall 2026, Mondays 5:05–7:35 PM, instructor Aaron Neyer). "
            "Students make something every week, write about it in their own words, and share it. Canvas is the official home for submissions and grades.", "",
            "## Lessons", ""]
    for w, t, s, _ in lessons:
        llms.append(f"- [{t}]({SITE}/lessons/week-{w}/lesson.md): {s}")
    llms += ["", "## Course", "",
             f"- [Syllabus]({SITE}/SYLLABUS_DRAFT.md): course description, rhythm, grading, policies",
             f"- [Schedule]({SITE}/schedule/): every week, what it covers, slides and lessons",
             f"- [Setup]({SITE}/setup/): accounts, one tool, one proof",
             f"- [Tools]({SITE}/studio/tools.html): the AI tools the class uses, with costs", ""]
    open("llms.txt", "w").write("\n".join(llms))
    print(f"built {len(lessons)} lessons")


if __name__ == "__main__":
    main()
