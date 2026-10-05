# Building the course site

The site is static HTML with one shared stylesheet: `assets/site.css`.
Fonts are self-hosted in `assets/fonts/`; their OFL licenses are included.

After editing shared navigation or the syllabus, run:

```sh
uv run -q --no-project --with markdown python tools/build_site.py
uv run -q --no-project --with markdown python tools/build_lessons.py
node --test worker/test/
git diff --check
```

`site_templates.py` is the single source for navigation and footers, including
lesson pages. `build_site.py` renders the syllabus offline and refreshes chrome.
`build_lessons.py` preserves the source markdown verbatim in `lesson.md`, builds
reader pages with a TOC, and regenerates `lessons/index.md` and `llms.txt`.

Student work is never embedded in the site. The studio reads opt-in builds from
the authenticated `/feed` API. Tailnet previews intentionally cannot sign in
because the API only allows the production course origin.
