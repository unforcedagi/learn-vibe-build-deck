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

import os
import re
import shutil
import subprocess
import zipfile

RENDER_VERSION = 1
R2_BUCKET = "lvb-instructor-files"
MAX_PAGES = 40                 # page images per document
MAX_TEXT_BYTES = 60000         # keeps a row well under D1's limits
MAX_RENDITION_BYTES = 290 * 1024 * 1024  # videos above this stay a Canvas link (set in the wrangler days; kept)
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
    """Tidy whitespace and cap the text (MAX_TEXT_BYTES) so a row stays small."""
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
FINAL_STATUSES = {"ok", "no preview for this file type", "video too large to copy"}


def has_content(row):
    return bool((row.get("text") or "").strip() or row.get("pages") or row.get("rendition"))


# ---------------------------------------------------------------------------
# Writing: through the course Worker's sync API (worker/lvb_admin.py), which
# upserts the row, prunes replaced files and stores the objects in R2.
# ---------------------------------------------------------------------------

def api_row(row, position):
    """The row as POST /admin/sync/files takes it."""
    out = {k: row[k] for k in ("canvas_file_id", "name", "content_type", "kind", "text", "rendition",
                               "rendition_type", "canvas_url", "status")}
    out.update(position=int(position), size=int(row["size"] or 0), pages=int(row["pages"]),
               render_version=RENDER_VERSION)
    return out


def object_type(key, rows_by_file):
    """Content type for an object key files/<canvas_file_id>/(p<n>.jpg|rendition)."""
    if not key.endswith("/rendition"):
        return "image/jpeg"
    row = rows_by_file.get(key.split("/")[1]) or {}
    return row.get("rendition_type") or "application/octet-stream"


def upload_objects(uploads, rows_by_file, workers=8):
    """Upload [(key, path)] to the private bucket, 8 at a time like the old
    `wrangler r2 bulk put --concurrency 8` (large files go multipart). On the
    first failure the queued uploads are cancelled and lvb_admin.ApiError is
    raised (the week's rows are then not written; the next run retries)."""
    import concurrent.futures
    import lvb_admin
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=workers)
    try:
        jobs = [pool.submit(lvb_admin.put_object, key, path, object_type(key, rows_by_file)) for key, path in uploads]
        for job in concurrent.futures.as_completed(jobs):
            job.result()
    except BaseException:
        pool.shutdown(wait=True, cancel_futures=True)
        raise
    pool.shutdown(wait=True)
