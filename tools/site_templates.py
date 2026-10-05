"""Shared static page chrome. Navigation must work without JavaScript."""
import html

NAV = [("schedule/", "Schedule"), ("lessons/", "Lessons"), ("readings/", "Readings"),
       ("syllabus.html", "Syllabus"), ("setup/", "Setup"), ("studio/", "Studio"),
       ("journal/", "Journal"), ("account/", "Account")]


def nav(prefix, current=""):
    links = "\n".join(
        f'<a href="{prefix}{href}"' + (' aria-current="page"' if label == current else '')
        + f'>{html.escape(label)}</a>' for href, label in NAV
    )
    return f'''<a class="skip-link" href="#main-content">Skip to content</a>
<header class="site-nav">
  <div class="site-nav-inner">
    <a class="brand" href="{prefix}"><span class="brand-mark" aria-hidden="true">L</span>Learn, Vibe, Build</a>
    <nav class="desktop-nav" aria-label="Course">{links}</nav>
    <details class="mobile-nav">
      <summary>Menu <span aria-hidden="true">&nbsp;+</span></summary>
      <nav aria-label="Course menu">{links}</nav>
    </details>
  </div>
</header>'''


def footer(prefix):
    return f'''<footer class="site-footer">
  <p>Learn, Vibe, Build<br>ATLS 4519 · CU Boulder · Fall 2026</p>
  <p><a href="{prefix}setup/">Getting started</a> · <a href="{prefix}syllabus.html">Syllabus</a><br>
  <a href="{prefix}llms.txt">Course map for AI</a> · <a href="https://github.com/unforcedagi/learn-vibe-build-deck">Source</a></p>
</footer>'''
