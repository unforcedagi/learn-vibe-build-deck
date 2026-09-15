#!/usr/bin/env python3
"""Re-sync the lvb-accounts D1 database from Canvas.

Pulls the current roster and submissions from the Canvas API, converts each
submission body from Canvas HTML to markdown, and upserts everything into the
remote D1 database via `wrangler d1 execute`. Idempotent and re-runnable:
new Canvas submissions appear, existing bodies get refreshed, visibility
choices students have made are never touched.

Each student's `login_alias` (their identikey@colorado.edu, from Canvas's
`login_id`) is refreshed on every run too — same treatment as name/email, so
a late add picks one up automatically and nobody has to backfill by hand.

Usage:
    python3 worker/resync.py

Requirements:
    - Canvas API token in ~/.canvastoken
    - Cloudflare API token in ~/.config/cloudflare/token
    - `pip install --user html2text`
    - npx/wrangler available (run from anywhere; the script cd's to worker/)

Prints only counts — never tokens, never student data.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.error
import urllib.request

import html2text

CANVAS_BASE = "https://canvas.colorado.edu/api/v1"
COURSE_ID = 145074
# week number -> Canvas assignment id
WEEK_ASSIGNMENTS = {1: 2858623, 2: 2858624}

CLOUDFLARE_ACCOUNT_ID = "8f2a7eb9d5e21ffa902a76cf62975c82"
WORKER_DIR = os.path.dirname(os.path.abspath(__file__))


def read_secret(path):
    with open(os.path.expanduser(path)) as f:
        return f.read().strip()


# ---------------------------------------------------------------------------
# Canvas
# ---------------------------------------------------------------------------

def canvas_get_paginated(token, path, params=None):
    """GET a Canvas collection endpoint, following Link: rel="next" pages."""
    params = dict(params or {})
    params.setdefault("per_page", 100)
    url = f"{CANVAS_BASE}{path}?{urllib.parse.urlencode(params, doseq=True)}"
    out = []
    while url:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            out.extend(json.load(resp))
            link = resp.headers.get("Link", "")
        url = None
        for part in link.split(","):
            if 'rel="next"' in part:
                url = part[part.find("<") + 1:part.find(">")]
                break
    return out


# ---------------------------------------------------------------------------
# HTML -> markdown
# ---------------------------------------------------------------------------

def make_converter():
    h = html2text.HTML2Text()
    h.body_width = 0          # no hard-wrapping mid-sentence
    h.unicode_snob = True     # real unicode, not entities
    h.ignore_images = False
    h.ignore_emphasis = False
    h.skip_internal_links = True
    return h


def html_to_markdown(conv, html):
    # Canvas prepends a stylesheet <link> to DesignPLUS-touched bodies; drop
    # any head-ish tags so they can't leak into output.
    html = re.sub(r"<link\b[^>]*>", "", html)
    md = conv.handle(html)
    # Collapse the 3+ blank lines html2text sometimes leaves between blocks.
    md = re.sub(r"\n{3,}", "\n\n", md).strip()
    return md



# ---------------------------------------------------------------------------
# Attachments -> text (so the instructor can read every submission on the
# site without downloading). pdf via pdftotext, docx/rtf/doc via macOS
# textutil, txt/md as-is. HTML uploads are treated as the build itself, not
# writing (a portfolio page is 37 MB of markup); images/video/zip are named
# but not read. Downloads are cached by attachment id and never re-fetched.
# ---------------------------------------------------------------------------

CACHE_DIR = os.path.expanduser("~/.scratch/lvb-canvas-files")
TEXT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/rtf": "rtf", "application/rtf": "rtf",
    "text/plain": "txt", "text/markdown": "txt",
}
MAX_TEXT_CHARS = 20000


def fetch_attachment(token, att):
    """Download once into the cache; return the local path (or None)."""
    d = os.path.join(CACHE_DIR, str(att["id"]))
    os.makedirs(d, exist_ok=True)
    name = os.path.basename(att.get("filename") or att.get("display_name") or "file")
    path = os.path.join(d, name)
    if os.path.exists(path):
        return path
    # Canvas attachment URLs carry a `verifier` query param that IS the
    # authorization; sending the API bearer as well gets a 401 once the
    # request is redirected to the file store. Try bare first, then bearer.
    data = None
    for headers in ({}, {"Authorization": f"Bearer {token}"}):
        try:
            req = urllib.request.Request(att["url"], headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            break
        except urllib.error.HTTPError as e:
            if e.code not in (401, 403):
                raise
    if data is None:
        return None
    with open(path, "wb") as f:
        f.write(data)
    return path


def extract_text(path, kind):
    try:
        if kind == "pdf":
            out = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, timeout=60)
            text = out.stdout
        elif kind in ("docx", "doc", "rtf"):
            out = subprocess.run(["textutil", "-convert", "txt", "-stdout", path], capture_output=True, text=True, timeout=60)
            text = out.stdout
        else:
            with open(path, encoding="utf-8", errors="replace") as f:
                text = f.read()
    except Exception as e:  # never let one bad file kill the sync
        return f"[could not extract text: {e.__class__.__name__}]"
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + "\n\n[truncated]"
    return text


def attachments_markdown(token, atts):
    """One block per attachment: a heading line with the Canvas link, then
    the extracted text for readable types."""
    blocks = []
    for att in atts:
        name = att.get("display_name") or att.get("filename") or "file"
        ctype = att.get("content-type") or ""
        url = att.get("url") or ""
        kind = TEXT_TYPES.get(ctype)
        size_kb = int(att.get("size") or 0) // 1024
        if kind:
            path = fetch_attachment(token, att)
            text = extract_text(path, kind) if path else "[download failed]"
            blocks.append(f"**Uploaded: [{name}]({url})**\n\n{text}")
        elif ctype.startswith("text/html"):
            blocks.append(f"**Uploaded build: [{name}]({url})** ({size_kb} KB HTML, the artifact itself)")
        else:
            blocks.append(f"**Uploaded: [{name}]({url})** ({ctype or 'file'}, {size_kb} KB)")
    return "\n\n---\n\n".join(blocks)


def comments_markdown(conv, r):
    """The student's own submission comments, which some people use as the
    place for their writing."""
    own = [c for c in (r.get("submission_comments") or []) if c.get("author_id") == r.get("user_id")]
    if not own:
        return ""
    parts = []
    for c in own:
        body = (c.get("comment") or "").strip()
        if body:
            parts.append(body)
    if not parts:
        return ""
    return "**Comment on Canvas:**\n\n" + "\n\n".join(parts)

# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

def q(s):
    """Quote a value as a SQL string literal (or NULL)."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def build_sql(roster, submissions_by_week):
    stmts = []
    for u in roster:
        email = (u.get("email") or "").strip().lower()
        if not email:
            continue
        login_id = (u.get("login_id") or "").strip().lower()
        login_alias = f"{login_id}@colorado.edu" if login_id else None
        stmts.append(
            "INSERT INTO students (canvas_id, name, email, login_alias) VALUES "
            f"({q(str(u['id']))}, {q(u['name'])}, {q(email)}, {q(login_alias)}) "
            "ON CONFLICT (email) DO UPDATE SET "
            "canvas_id = excluded.canvas_id, name = excluded.name, "
            "login_alias = excluded.login_alias;"
        )
    for week, subs in submissions_by_week.items():
        for s in subs:
            # Never overwrite a site-native submission (it has a link and the
            # student's own share choices); Canvas only fills in rows that
            # Canvas created, i.e. rows whose link_url is still NULL or that
            # this sync wrote before.
            stmts.append(
                "INSERT INTO submissions (student_id, week, body, submitted_at, link_url) "
                f"SELECT id, {int(week)}, {q(s['body_md'])}, {q(s['submitted_at'])}, {q(s.get('link_url'))} "
                f"FROM students WHERE canvas_id = {q(str(s['user_id']))} "
                "ON CONFLICT (student_id, week) DO UPDATE SET "
                "body = COALESCE(excluded.body, submissions.body), "
                "submitted_at = excluded.submitted_at, "
                "link_url = COALESCE(submissions.link_url, excluded.link_url) "
                "WHERE submissions.share_build = 0 AND submissions.share_writing = 0 "
                "AND (submissions.link_url IS NULL OR submissions.link_url = excluded.link_url);"
            )
    return "\n".join(stmts)


def run_wrangler_d1(sql):
    env = dict(os.environ)
    env["CLOUDFLARE_API_TOKEN"] = read_secret("~/.config/cloudflare/token")
    env["CLOUDFLARE_ACCOUNT_ID"] = CLOUDFLARE_ACCOUNT_ID
    # Student data goes through a temp file outside the repo, never argv.
    with tempfile.NamedTemporaryFile(
        "w", suffix=".sql", dir=tempfile.gettempdir(), delete=False
    ) as f:
        f.write(sql)
        path = f.name
    try:
        res = subprocess.run(
            ["npx", "-y", "wrangler", "d1", "execute", "lvb-accounts",
             "--remote", "--json", "--file", path],
            cwd=WORKER_DIR, env=env, capture_output=True, text=True, timeout=300,
        )
    finally:
        os.unlink(path)
    if res.returncode != 0:
        # wrangler errors echo the SQL context, not credentials; keep it short.
        sys.exit(f"wrangler d1 execute failed:\n{res.stderr[-2000:]}")
    # npx/wrangler may print banner noise around the JSON; take the array.
    start = res.stdout.find("[")
    if start == -1:
        sys.exit(f"wrangler produced no JSON output:\n{res.stdout[-500:]}")
    return json.loads(res.stdout[start:res.stdout.rfind("]") + 1])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    canvas_token = read_secret("~/.canvastoken")

    roster = canvas_get_paginated(
        canvas_token,
        f"/courses/{COURSE_ID}/users",
        {"enrollment_type[]": "student"},
    )
    print(f"canvas roster: {len(roster)} students")

    conv = make_converter()
    submissions_by_week = {}
    for week, assignment_id in WEEK_ASSIGNMENTS.items():
        rows = canvas_get_paginated(
            canvas_token,
            f"/courses/{COURSE_ID}/assignments/{assignment_id}/submissions",
            {"include[]": ["submission_comments"]},
        )
        subs = []
        for r in rows:
            if r.get("workflow_state") == "unsubmitted" or not r.get("submitted_at"):
                continue
            # Week 2 on accepts a URL or a file upload as the build, so a
            # submission may have no body at all. Keep the row anyway: the
            # link (or the first attachment's Canvas URL) becomes link_url.
            body = r.get("body") or ""
            link = (r.get("url") or "").strip() or None
            # A URL submission's attachment is Canvas's own screenshot of the
            # page, not something the student uploaded.
            atts = [] if link else (r.get("attachments") or [])
            if not link and atts:
                link = atts[0].get("url")
            if not body and not link:
                continue
            parts = []
            if body:
                parts.append(html_to_markdown(conv, body))
            if atts:
                parts.append(attachments_markdown(canvas_token, atts))
            comments = comments_markdown(conv, r)
            if comments:
                parts.append(comments)
            subs.append({
                "user_id": r["user_id"],
                "body_md": "\n\n".join(parts) if parts else None,
                "submitted_at": r.get("submitted_at"),
                "link_url": link,
            })
        leftover = sum(1 for s in subs if re.search(r"</?(p|div|span|br)\b", s["body_md"] or ""))
        print(f"week {week}: {len(subs)} submissions with bodies "
              f"({leftover} with residual html tags)")
        submissions_by_week[week] = subs

    sql = build_sql(roster, submissions_by_week)
    results = run_wrangler_d1(sql)
    changed = sum(r.get("meta", {}).get("changes", 0) for r in results)
    print(f"d1: {len(results)} statements executed, {changed} rows written")
    print("done — re-run any time; visibility choices are preserved.")


if __name__ == "__main__":
    main()
