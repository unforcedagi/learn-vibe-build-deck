"""Canvas uploads -> readable content for the instructor view.

worker/resync.py calls this for every file a student uploaded to a Canvas
"Week N" assignment. Each file becomes one `submission_files` row in D1 (the
extracted text plus what renderings exist) and, where there is something to
look at, objects in the private R2 bucket `lvb-instructor-files`:

    files/<canvas_file_id>/p1.jpg ...   page images (PDF, Word, RTF, slides)
    files/<canvas_file_id>/rendition    the file itself (HTML page, image, video)

Only the instructor can read either (GET /instructor/file/<id>/<part> in
worker/src/index.js); the student-facing endpoints never touch them. HTML is
stored as-is and only ever shown in a sandboxed iframe without
allow-same-origin, so a student's script never runs in a learnvibe.build origin.

A file is processed once per RENDER_VERSION: the sync reads which Canvas file
ids D1 already has at this version and skips them, so the daily run only
downloads and uploads new uploads. Bump RENDER_VERSION to re-render everything.

Prints counts only, never student names or text.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile

RENDER_VERSION = 1
R2_BUCKET = "lvb-instructor-files"
MAX_PAGES = 40                 # page images per document
MAX_TEXT_BYTES = 60000         # D1 caps one SQL statement at 100 KB
MAX_RENDITION_BYTES = 290 * 1024 * 1024  # wrangler r2 object put limit is 300 MB
PAGE_WIDTH = 1400              # px; readable on a laptop, fine on a phone

OFFICE_EXT = {".docx", ".doc", ".rtf", ".odt", ".pptx", ".ppt", ".odp", ".pages"}
OFFICE_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword", "text/rtf", "application/rtf",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.oasis.opendocument.presentation",
}
IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}
VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
ARCHIVE_TYPES = {"application/zip", "application/x-zip-compressed"}
TEXT_EXT = {".txt", ".md", ".py", ".js", ".ts", ".css", ".json", ".csv", ".jsx", ".tsx", ".sh"}


def kind_of(content_type, name):
    ct = (content_type or "").split(";")[0].strip().lower()
    ext = os.path.splitext(name or "")[1].lower()
    if ct == "application/pdf" or ext == ".pdf":
        return "pdf"
    if ct in OFFICE_TYPES or ext in OFFICE_EXT:
        return "office"
    if ct == "text/html" or ext in (".html", ".htm"):
        return "html"
    if ct in IMAGE_TYPES:
        return "image"
    if ct in VIDEO_TYPES:
        return "video"
    if ct in ARCHIVE_TYPES or ext == ".zip":
        return "archive"
    if ct.startswith("text/") or ext in TEXT_EXT or ct in ("application/json", "application/x-python"):
        return "text"
    return "other"


def cap_text(text):
    """Tidy whitespace and keep the text under the D1 statement limit."""
    text = (text or "").replace("\x00", "").replace("\x0c", "\n\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    raw = text.encode("utf-8")
    if len(raw) > MAX_TEXT_BYTES:
        text = raw[:MAX_TEXT_BYTES].decode("utf-8", "ignore") + "\n\n[truncated: the rest is in the pages]"
    return text


def _run(cmd, timeout=180):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def pdf_text(path):
    # No -layout: reflowed text reads better on a phone than column-aligned text.
    return _run(["pdftotext", "-enc", "UTF-8", path, "-"]).stdout


def pdf_pages(path, outdir):
    """Render up to MAX_PAGES pages to JPEG; return their paths in page order."""
    os.makedirs(outdir, exist_ok=True)
    _run(["pdftoppm", "-jpeg", "-jpegopt", "quality=72", "-scale-to-x", str(PAGE_WIDTH),
          "-scale-to-y", "-1", "-l", str(MAX_PAGES), path, os.path.join(outdir, "p")], timeout=600)
    pages = [f for f in os.listdir(outdir) if re.fullmatch(r"p-\d+\.jpg", f)]
    pages.sort(key=lambda f: int(re.search(r"\d+", f).group()))
    return [os.path.join(outdir, f) for f in pages]


def office_to_pdf(path, outdir):
    """LibreOffice headless, with its own profile so a running LibreOffice
    (or another sync) can't lock it."""
    profile = os.path.join(outdir, "lo-profile")
    _run(["soffice", f"-env:UserInstallation=file://{profile}", "--headless",
          "--convert-to", "pdf", "--outdir", outdir, path], timeout=300)
    base = os.path.splitext(os.path.basename(path))[0] + ".pdf"
    out = os.path.join(outdir, base)
    return out if os.path.exists(out) else None


def html_text(raw):
    """Readable text of an uploaded HTML page. Scripts, styles and inline
    data: URIs (a portfolio page can be 37 MB of base64 images) are dropped
    before conversion."""
    import html2text
    html = raw.decode("utf-8", "replace")
    html = re.sub(r"(?is)<(script|style|noscript|template)\b.*?</\1\s*>", " ", html)
    html = re.sub(r"(?i)data:[a-z0-9.+/-]+;base64,[a-z0-9+/=\s]+", "", html)
    h = html2text.HTML2Text()
    h.body_width = 0
    h.unicode_snob = True
    h.ignore_images = True
    h.skip_internal_links = True
    return h.handle(html)


def image_text(path):
    """OCR, kept only when it found real words (a photo yields noise)."""
    if not shutil.which("tesseract"):
        return ""
    text = _run(["tesseract", path, "-", "--psm", "3"], timeout=120).stdout
    words = re.findall(r"[A-Za-z]{3,}", text)
    return text if len(words) >= 15 else ""


def archive_text(path):
    try:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if not n.startswith("__MACOSX/") and not n.endswith("/")]
            out = [f"Zip archive, {len(names)} files:", ""] + [f"- {n}" for n in names[:300]]
            if len(names) > 300:
                out.append(f"- ... and {len(names) - 300} more")
            # A README is usually the writing.
            for n in names:
                if re.search(r"(^|/)readme(\.md|\.txt)?$", n, re.I) and z.getinfo(n).file_size < 200000:
                    out += ["", f"{n}:", "", z.read(n).decode("utf-8", "replace")]
                    break
            return "\n".join(out)
    except zipfile.BadZipFile:
        return ""


def process(path, att, workdir):
    """Turn one downloaded Canvas attachment into a row + R2 uploads.

    Returns {"row": {...}, "uploads": [(r2_key, local_path), ...]}. Never
    raises for a bad file: the row's status says what went wrong.
    """
    fid = str(att["id"])
    name = att.get("display_name") or att.get("filename") or "file"
    ctype = (att.get("content-type") or "").split(";")[0].strip().lower()
    kind = kind_of(ctype, name)
    row = {"canvas_file_id": fid, "name": name, "content_type": ctype or None,
           "size": int(att.get("size") or 0), "kind": kind, "text": "", "pages": 0,
           "rendition": None, "rendition_type": None, "canvas_url": att.get("url"),
           "status": "ok"}
    uploads = []
    prefix = f"files/{fid}/"
    out = os.path.join(workdir, fid)
    os.makedirs(out, exist_ok=True)
    try:
        if path is None:
            row["status"] = "download failed"
        elif kind in ("pdf", "office"):
            pdf = path if kind == "pdf" else office_to_pdf(path, out)
            if not pdf:
                row["status"] = "could not convert"
                if kind == "office" and shutil.which("soffice"):
                    row["text"] = _run(["soffice", f"-env:UserInstallation=file://{out}/lo-cat",
                                        "--headless", "--cat", path]).stdout
            else:
                row["text"] = pdf_text(pdf)
                pages = pdf_pages(pdf, os.path.join(out, "pages"))
                row["pages"] = len(pages)
                uploads += [(f"{prefix}p{i}.jpg", p) for i, p in enumerate(pages, 1)]
        elif kind == "html":
            with open(path, "rb") as f:
                raw = f.read()
            row["text"] = html_text(raw)
            if len(raw) <= MAX_RENDITION_BYTES:
                row["rendition"], row["rendition_type"] = "html", "text/html"
                uploads.append((prefix + "rendition", path))
        elif kind == "image":
            row["rendition"], row["rendition_type"] = "image", ctype
            uploads.append((prefix + "rendition", path))
            row["text"] = image_text(path)
        elif kind == "video":
            if row["size"] <= MAX_RENDITION_BYTES:
                row["rendition"], row["rendition_type"] = "video", ctype
                uploads.append((prefix + "rendition", path))
            else:
                row["status"] = "video too large to copy"
        elif kind == "archive":
            row["text"] = archive_text(path)
        elif kind == "text":
            with open(path, "rb") as f:
                row["text"] = f.read(MAX_TEXT_BYTES * 2).decode("utf-8", "replace")
        else:
            row["status"] = "no preview for this file type"
    except Exception as e:  # never let one bad file kill the sync
        row["status"] = f"could not read: {e.__class__.__name__}"
    row["text"] = cap_text(row["text"])
    return {"row": row, "uploads": uploads}


# Statuses that won't change on a retry. Anything else ("download failed",
# "could not convert", "could not read: ...") is tried again next run.
FINAL_STATUS_SQL = ("status = 'ok' OR status = 'no preview for this file type' "
                    "OR status = 'video too large to copy'")


def has_content(row):
    return bool((row.get("text") or "").strip() or row.get("pages") or row.get("rendition"))


# ---------------------------------------------------------------------------
# SQL + R2
# ---------------------------------------------------------------------------

def _q(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def upsert_sql(row, canvas_user_id, week, position, now_iso):
    cols = ["student_id", "week", "canvas_file_id", "position", "name", "content_type", "size",
            "kind", "text", "pages", "rendition", "rendition_type", "canvas_url", "status",
            "render_version", "updated_at"]
    vals = [str(int(week)), _q(row["canvas_file_id"]), str(int(position)), _q(row["name"]),
            _q(row["content_type"]), str(int(row["size"] or 0)), _q(row["kind"]), _q(row["text"]),
            str(int(row["pages"])), _q(row["rendition"]), _q(row["rendition_type"]),
            _q(row["canvas_url"]), _q(row["status"]), str(RENDER_VERSION), _q(now_iso)]
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c != "canvas_file_id")
    return (f"INSERT INTO submission_files ({', '.join(cols)}) "
            f"SELECT id, {', '.join(vals)} FROM students WHERE canvas_id = {_q(str(canvas_user_id))} "
            f"ON CONFLICT (canvas_file_id) DO UPDATE SET {updates};")


def prune_sql(canvas_user_id, week, keep_ids):
    """Drop rows for files no longer in this student's submission for the
    week (a Canvas resubmission replaces the attachment list)."""
    keep = ", ".join(_q(str(i)) for i in keep_ids) or "''"
    return (f"DELETE FROM submission_files WHERE week = {int(week)} "
            f"AND student_id = (SELECT id FROM students WHERE canvas_id = {_q(str(canvas_user_id))}) "
            f"AND canvas_file_id NOT IN ({keep});")


def r2_bulk_put(uploads, env, cwd):
    """Upload [(key, path)] to the private bucket in one wrangler call."""
    if not uploads:
        return
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump([{"key": k, "file": p} for k, p in uploads], f)
        listing = f.name
    try:
        res = subprocess.run(
            ["npx", "-y", "wrangler", "r2", "bulk", "put", R2_BUCKET, "--remote",
             "--filename", listing, "--concurrency", "8", "--force"],
            cwd=cwd, env=env, capture_output=True, text=True, timeout=3600)
    finally:
        os.unlink(listing)
    if res.returncode != 0:
        # Object keys are file ids, not names; keep the error short anyway.
        raise RuntimeError(f"wrangler r2 bulk put failed:\n{res.stderr[-1500:]}")
