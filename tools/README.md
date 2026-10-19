# Building the course site

The site is static HTML with one shared stylesheet: `assets/site.css`.
Fonts are self-hosted in `assets/fonts/`; their OFL licenses are included.

After editing shared navigation or the syllabus, run:

```sh
uv run -q --no-project --with markdown python tools/build_site.py
uv run -q --no-project --with markdown python tools/build_lessons.py
python3 tools/build_schedule.py
node --test worker/test/
git diff --check
```

## The semester calendar

`schedule/semester.json` is the one source for every class meeting. From it,
`tools/build_schedule.py` writes:

- the home page's "This week" block and term path (`index.html`);
- the schedule page's "This week" block and table rows (`schedule/index.html`);
- the Worker's submission calendar, `worker/src/weeks.generated.js` (WEEKS).

`build_lessons.py` reads each lesson's slide link from it too. The generated
parts of the pages sit between `<!-- generated:… -->` markers. Edit outside
them freely, never inside.

**The week changes on its own.** The current week is the latest class on or
before today in Denver. `.github/workflows/schedule.yml` runs the generator
just after midnight every day and commits if the output changed, so on Monday
the site moves to the new week and Pages redeploys. Nobody edits anything.

**To fill in a week** (lesson, slides, tasks), edit only that week's entry in
`semester.json`, then run one command and commit:

```sh
python3 tools/build_schedule.py      # writes the pages and WEEKS for today
node --test worker/test/             # includes the calendar guard
```

If you add a lesson, add `lessons/src/week-N.md`, set `"lesson":
"lessons/week-N/"` (and `"slides"`) on the week, and run `build_lessons.py`
too. Forgetting the `"lesson"` field fails the check.

Fields on a meeting (text is plain, not HTML; paths are from the site root):

| field | used for |
|---|---|
| `week`, `date`, `kind` | number, ISO date, one of lesson/studio/guest/demos/no-class |
| `title`, `tag` | home heading and term path (`tag` is the small label, e.g. "Studio") |
| `summary` | home "This week" paragraph |
| `headline`, `plan`, `work` | schedule "This week" block (default to title, summary, assignment title) |
| `covers`, `due`, `materials_note` | schedule table row |
| `lesson`, `slides` | links on home, schedule and the lesson page |
| `tasks` | home task cards; `"submit": true` adds the due date and submit links. Without tasks the home page shows the assignment |
| `assignment` | `title`, `due_at` (UTC: `05:59Z` is 11:59 PM MDT, `06:59Z` MST), `canvas_id`, `prompt`. Write `null` for a week with no weekly submission |

Canvas links in the schedule table appear once a week arrives, since future
Canvas assignments are often still unpublished.

**When an assignment changes** (a new one, a due date, a prompt), the Worker
needs a deploy before students see it: `cd worker && npx wrangler deploy`.
Page-only changes need nothing beyond the commit.

`python3 tools/build_schedule.py --check` exits 1 if semester.json is invalid,
a page or WEEKS is out of date, or the calendar has under 14 days of runway.
`--date YYYY-MM-DD` renders as of another day (with `--check`, or in a scratch
copy of the repo to preview a future week).

Week 6's lesson page has its own kit, written by `build_week6.py` after
`build_lessons.py`. That script also writes instructor files outside the repo.

`site_templates.py` is the single source for navigation and footers, including
lesson pages. `build_site.py` renders the syllabus offline and refreshes chrome.
`build_lessons.py` preserves the source markdown verbatim in `lesson.md`, builds
reader pages with a TOC, and regenerates `lessons/index.md` and `llms.txt`.

Student work is never embedded in the site. The studio reads opt-in builds from
the authenticated `/feed` API. Tailnet previews intentionally cannot sign in
because the API only allows the production course origin.
