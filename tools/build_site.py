"""Refresh shared chrome and render the syllabus as static HTML.
Run: uv run -q --no-project --with markdown python tools/build_site.py
Then run build_lessons.py to regenerate lesson pages.
"""
from pathlib import Path
import re
import markdown
from site_templates import nav, footer

ROOT = Path(__file__).resolve().parent.parent
PAGES = {
    "index.html": ("", "home"),
    "schedule/index.html": ("Schedule", "schedule"),
    "readings/index.html": ("Readings", "readings"),
    "syllabus.html": ("Syllabus", "syllabus"),
    "setup/index.html": ("Setup", "setup"),
    "studio/index.html": ("Studio", "studio"),
    "studio/ideas.html": ("Studio", "ideas"),
    "studio/tools.html": ("Studio", "tools"),
    "journal/index.html": ("Journal", "journal"),
    "account/index.html": ("Account", "account"),
    "instructor/index.html": ("", "instructor"),
}
LABELS = {"schedule": "The semester / week by week", "readings": "The reading shelf / ideas to build with",
          "setup": "Start here / accounts, one tool, one proof", "journal": "Notes from the room / Fall 2026"}


def main():
    for relative, (current, kind) in PAGES.items():
        path = ROOT / relative
        prefix = "../" * (len(Path(relative).parts) - 1) or "./"
        text = path.read_text()
        text = re.sub(r'<style>.*?</style>\s*', '', text, flags=re.S)
        text = re.sub(r'<a class="skip-link".*?</a>\s*', '', text, flags=re.S)
        text = re.sub(r'<header class="site-nav">.*?</header>', nav(prefix, current), text, count=1, flags=re.S)
        text = re.sub(r'<footer class="site-footer">.*?</footer>\s*', '', text, flags=re.S)
        text = re.sub(r'<body(?: class="[^"]*")?>', f'<body class="{kind}-page">', text, count=1)
        text = re.sub(r'<main[^>]*>', f'<main class="{kind}-main" id="main-content">', text, count=1)
        if kind in LABELS and f'<p class="kicker">{LABELS[kind]}</p>' not in text:
            text = text.replace(f'<main class="{kind}-main" id="main-content">',
                                f'<main class="{kind}-main" id="main-content">\n  <p class="kicker">{LABELS[kind]}</p>', 1)
        if kind == "syllabus":
            rendered = markdown.markdown((ROOT / 'SYLLABUS_DRAFT.md').read_text(), extensions=['tables', 'fenced_code'])
            text = re.sub(r'<div id="content">.*?</div>', f'<div id="content">{rendered}</div>', text, count=1, flags=re.S)
            text = re.sub(r'<script[^>]*>.*?</script>\s*', '', text, flags=re.S)
        text = text.replace('</body>', footer(prefix) + '\n</body>')
        path.write_text(text)
    print(f'Refreshed {len(PAGES)} static pages (including static syllabus)')


if __name__ == '__main__':
    main()
