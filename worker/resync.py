#!/usr/bin/env python3
"""Re-sync the lvb-accounts D1 database from Canvas.

Pulls the current roster and submissions from the Canvas API, converts each
submission body from Canvas HTML to markdown, and upserts everything into D1
through the course Worker's sync API (POST /admin/sync/canvas, see
worker/lvb_admin.py). Idempotent and re-runnable:
new Canvas submissions appear, existing bodies get refreshed, visibility
choices students have made are never touched.

Each student's `login_alias` (their identikey@colorado.edu, from Canvas's
`login_id`) is refreshed on every run too — same treatment as name/email, so
a late add picks one up automatically and nobody has to backfill by hand.

Usage:
    python3 worker/resync.py                # every published "Week N" assignment
    python3 worker/resync.py --week 4       # only that week (roster still refreshes)
    python3 worker/resync.py --dry-run      # read Canvas, print counts, write nothing
    python3 worker/resync.py --files        # uploads -> readable content for the
                                            # instructor (worker/submission_files.py)

Weeks are discovered from Canvas by assignment name ("Week 4 Studio Cycle",
"Week 1 — Intentions"), so no per-week edit is needed. Unpublished weeks are
skipped because students can't submit to them.

Requirements:
    - Canvas API token in ~/.canvastoken
    - the course Worker's admin key in ~/.config/lvb/admin.key (reaches only
      course data; no Cloudflare token is used)
    - html2text (`uv run --with html2text`)

Prints only counts — never tokens, never student data.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.error
import urllib.request

import html2text

CANVAS_BASE = "https://canvas.colorado.edu/api/v1"
COURSE_ID = 145074
# week number -> Canvas assignment id. Filled from Canvas at run time by
# discover_week_assignments(); set it before main() only to force a mapping.
WEEK_ASSIGNMENTS = None
WEEK_NAME_RE = re.compile(r"^\s*Week\s+(\d+)\b", re.IGNORECASE)

WORKER_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, WORKER_DIR)
import lvb_admin  # noqa: E402


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
            if shutil.which("textutil"):  # macOS
                cmd = ["textutil", "-convert", "txt", "-stdout", path]
            else:  # Linux: LibreOffice prints the document's text
                cmd = ["soffice", "--headless", "--cat", path]
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
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
# Writing (the Worker's sync API)
# ---------------------------------------------------------------------------

def build_rows(roster, submissions_by_week):
    """The roster and submissions as POST /admin/sync/canvas takes them.
    The Worker applies the rule resync always had: Canvas only fills a
    submission row that has no writing yet, so a student's own site text
    (two Week 2 reflections were replaced by shorter Canvas text on 10-05) is
    never overwritten."""
    students = []
    for u in roster:
        email = (u.get("email") or "").strip().lower()
        if not email:
            continue
        login_id = (u.get("login_id") or "").strip().lower()
        students.append({"canvas_id": str(u["id"]), "name": u["name"], "email": email,
                         "login_alias": f"{login_id}@colorado.edu" if login_id else None})
    subs = [{"canvas_id": str(s["user_id"]), "week": int(week), "body": s["body_md"],
             "submitted_at": s["submitted_at"], "link_url": s.get("link_url")}
            for week, ss in submissions_by_week.items() for s in ss]
    return students, subs


def write_rows(students, subs):
    """Send the roster first (submissions find their student by canvas id),
    in chunks under the Worker's per-request statement cap."""
    written = {"students": 0, "submissions": 0}
    for kind, items in (("students", students), ("submissions", subs)):
        for chunk in lvb_admin.chunks(items):
            written[kind] += lvb_admin.post("canvas", {kind: chunk})[kind]["written"]
    return written


def sync_files(canvas_token, uploads_by_week, dry_run=False):
    """Every uploaded file -> extracted text + renderings (R2) + a
    submission_files row. Files already processed at the current
    RENDER_VERSION are skipped (unless the last try failed in a way worth
    retrying); rows for files a student replaced are pruned. Each week is
    saved before the next starts, so a run cut short keeps what it finished.
    uploads_by_week: {week: [(canvas_user_id, [attachment, ...]), ...]}"""
    import collections
    import submission_files as sf

    total = sum(len(atts) for subs in uploads_by_week.values() for _, atts in subs)
    if dry_run:
        print(f"files: {total} uploads across weeks {sorted(uploads_by_week)} (dry run, nothing read)")
        return
    done = {r["canvas_file_id"] for r in lvb_admin.rows("files")
            if r["render_version"] == sf.RENDER_VERSION and r["status"] in sf.FINAL_STATUSES}
    # A Canvas user with no students row (the Test Student, a drop) would get
    # no row and be re-rendered every night; leave them out.
    known = {r["canvas_id"] for r in lvb_admin.rows("students") if r["canvas_id"] is not None}
    seen = collections.Counter(str(a["id"]) for subs in uploads_by_week.values() for _, atts in subs for a in atts)
    shared = sum(1 for n in seen.values() if n > 1)
    if shared:
        # canvas_file_id is unique: the later week would take the row over.
        print(f"files: warning: {shared} Canvas file ids appear in more than one submission")
    counts = collections.Counter()
    with tempfile.TemporaryDirectory(dir=os.path.expanduser("~/.scratch")) as work:
        for week, subs in uploads_by_week.items():
            groups, uploads, rows_by_file = [], [], {}
            for user_id, atts in subs:
                if str(user_id) not in known:
                    counts["no_student"] += len(atts)
                    continue
                rows = []
                for pos, att in enumerate(atts):
                    if str(att["id"]) in done:
                        counts["skipped"] += 1
                        continue
                    try:
                        path = fetch_attachment(canvas_token, att)
                    except Exception:  # one unreachable file doesn't stop the rest
                        path = None
                    out = sf.process(path, att, work)
                    counts["new"] += 1
                    counts["with_content" if sf.has_content(out["row"]) else "link_only"] += 1
                    uploads += out["uploads"]
                    rows_by_file[out["row"]["canvas_file_id"]] = out["row"]
                    rows.append(sf.api_row(out["row"], pos))
                # Upsert what was processed, then prune files a resubmission dropped.
                groups.append({"week": int(week), "canvas_id": str(user_id), "rows": rows,
                               "keep": [str(a["id"]) for a in atts]})
            # Objects first, rows second: a row never points at a missing page.
            sf.upload_objects(uploads, rows_by_file)
            counts["objects"] += len(uploads)
            for chunk in file_group_chunks(groups):
                res = lvb_admin.post("files", {"groups": chunk})
                counts["rows"] += res["written"]
                counts["pruned"] += res["pruned"]
    print(f"files: {total} uploads, {counts['skipped']} already done, {counts['new']} processed "
          f"({counts['with_content']} with content, {counts['link_only']} link only), "
          f"{counts['no_student']} from Canvas users not in D1, {counts['objects']} objects uploaded, "
          f"{counts['rows']} rows written, {counts['pruned']} replaced files pruned")


def file_group_chunks(groups, limit=lvb_admin.CHUNK):
    """Groups in requests of at most `limit` statements (one per row, one prune
    per group); a group with more rows than that is split, the prune last."""
    batch, size = [], 0
    for g in groups:
        rows = g["rows"]
        while len(rows) + 1 > limit:  # only a submission with 40+ files
            if batch:
                yield batch
                batch, size = [], 0
            # Each part carries the same prune; it keeps every current id, so repeating it is safe.
            yield [{**g, "rows": rows[:limit - 1]}]
            rows = rows[limit - 1:]
        if size + len(rows) + 1 > limit and batch:
            yield batch
            batch, size = [], 0
        batch.append({**g, "rows": rows})
        size += len(rows) + 1
    if batch:
        yield batch


def discover_week_assignments(token, include_unpublished=False):
    """Map week number -> assignment id from Canvas assignment names."""
    found = {}
    for a in canvas_get_paginated(token, f"/courses/{COURSE_ID}/assignments"):
        m = WEEK_NAME_RE.match(a.get("name") or "")
        if not m:
            continue
        if not a.get("published") and not include_unpublished:
            continue
        week = int(m.group(1))
        if week in found:
            sys.exit(f"two Canvas assignments claim week {week}; fix names first")
        found[week] = a["id"]
    return dict(sorted(found.items()))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Canvas -> D1 resync")
    ap.add_argument("--week", type=int, action="append",
                    help="only sync this week (repeatable)")
    ap.add_argument("--dry-run", action="store_true",
                    help="read Canvas and print counts; no D1 writes")
    ap.add_argument("--files", action="store_true",
                    help="only the uploaded files: extract, render, upload for the instructor")
    args = ap.parse_args(argv)

    canvas_token = read_secret("~/.canvastoken")
    weeks = WEEK_ASSIGNMENTS or discover_week_assignments(canvas_token)
    if args.week:
        missing = [w for w in args.week if w not in weeks]
        if missing:
            sys.exit(f"no published Canvas assignment for week(s) {missing}")
        weeks = {w: weeks[w] for w in args.week}
    print(f"weeks: {sorted(weeks)}")

    roster = canvas_get_paginated(
        canvas_token,
        f"/courses/{COURSE_ID}/users",
        {"enrollment_type[]": "student"},
    )
    print(f"canvas roster: {len(roster)} students")

    conv = make_converter()
    submissions_by_week = {}
    uploads_by_week = {}
    for week, assignment_id in weeks.items():
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
            uploads_by_week.setdefault(week, []).append((r["user_id"], atts))
            if args.files:
                continue
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
        if args.files:
            continue
        leftover = sum(1 for s in subs if re.search(r"</?(p|div|span|br)\b", s["body_md"] or ""))
        print(f"week {week}: {len(subs)} submissions with bodies "
              f"({leftover} with residual html tags)")
        submissions_by_week[week] = subs

    if args.files:
        sync_files(canvas_token, uploads_by_week, dry_run=args.dry_run)
        return

    students, subs = build_rows(roster, submissions_by_week)
    if args.dry_run:
        print(f"dry run: {len(students)} roster rows and {len(subs)} submissions built, nothing written")
        return
    written = write_rows(students, subs)
    # Rows with no writing yet (new, or link-only with no body) are written on
    # every run; rows with writing are left alone.
    print(f"d1: {len(students)} roster rows and {len(subs)} submissions sent; "
          f"{written['students']} roster rows written, {written['submissions']} submissions written "
          f"(new or still without writing)")
    print("done — re-run any time; visibility choices are preserved.")


if __name__ == "__main__":
    try:
        main()
    except lvb_admin.ApiError as e:  # the route and status only, never data
        sys.exit(f"sync api: {e}")
