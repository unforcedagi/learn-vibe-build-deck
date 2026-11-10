"""The course Worker's sync API (/admin/sync/*), for the uni timers.

resync.py, student_reads.py and the reader / final-plans syncs read and write
the course data through these routes, with the admin key in
~/.config/lvb/admin.key (it reaches only course data). They used to call
`wrangler d1 execute` with a Cloudflare account token that reached every
database on the account.

    rows("submissions")          # GET /admin/sync/<name>
    post("canvas", {...})        # POST /admin/sync/<name>
    put_object(key, path, type)  # the FILES bucket, multipart over 90 MB

Errors exit with the route, the HTTP status and the Worker's short error code;
the key is never printed and student text is never in an error.
"""

import http.client
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("LVB_API", "https://api.learnvibe.build")
KEY_PATH = os.path.expanduser(os.environ.get("LVB_ADMIN_KEY_FILE", "~/.config/lvb/admin.key"))
# The Worker runs at most 45 statements per request (D1's per-invocation cap
# on the Free plan is 50); stay under it.
CHUNK = 40
SINGLE_PUT_MAX = 90 * 1024 * 1024  # a Worker request body is capped at 100 MB
PART_SIZE = 50 * 1024 * 1024        # R2 multipart parts: 5 MB minimum, all but the last the same size


class ApiError(RuntimeError):
    pass


def _key():
    try:
        with open(KEY_PATH) as f:
            key = f.read().strip()
    except OSError:
        raise ApiError(f"no admin key at {KEY_PATH}") from None
    if not key:
        raise ApiError(f"{KEY_PATH} is empty")
    return key


def _error_code(e):
    """The Worker's short error code from an HTTP error reply, or ''."""
    try:
        reply = json.loads(e.read().decode(errors="replace"))
        return str(reply.get("error", "")) if isinstance(reply, dict) else ""
    except Exception:  # an unreadable or non-JSON error body: the status is enough
        return ""


def call(method, path, body=None, data=None, content_type=None, timeout=300, length=None):
    """One request to the Worker; returns the parsed JSON reply. `data` may be
    bytes or an open file (then give its `length`; urllib streams it)."""
    headers = {
        "Authorization": "Bearer " + _key(),
        # Cloudflare's browser integrity check refuses urllib's default UA (error 1010).
        "User-Agent": "lvb-sync/1.0 (uni timers)",
    }
    if body is not None:
        data = json.dumps(body).encode()
        content_type = "application/json"
    if content_type:
        headers["Content-Type"] = content_type
    if data is not None:
        headers["Content-Length"] = str(len(data) if length is None else length)
    req = urllib.request.Request(API + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        raise ApiError(f"{method} {path.split('?')[0]} -> HTTP {e.code} {_error_code(e)}".rstrip()) from None
    except urllib.error.URLError as e:
        raise ApiError(f"{method} {path.split('?')[0]} -> {e.reason}") from None
    except (OSError, ValueError, http.client.HTTPException) as e:  # timeout, reset, a reply that isn't JSON
        raise ApiError(f"{method} {path.split('?')[0]} -> {e.__class__.__name__}") from None


def rows(name):
    """Rows of one of the Worker's named reads (students, submissions,
    board-posts, student-reads, files)."""
    return call("GET", f"/admin/sync/{name}")["rows"]


def post(name, body):
    return call("POST", f"/admin/sync/{name}", body=body)


def chunks(items, size=CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def put_object(key, path, content_type="application/octet-stream"):
    """Upload one file into the private FILES bucket at `key`."""
    size = os.path.getsize(path)
    route = f"/admin/sync/object/{key}"
    with open(path, "rb") as f:
        if size <= SINGLE_PUT_MAX:  # streamed from disk, not read into memory
            return call("PUT", route, data=f, length=size, content_type=content_type, timeout=900)
        # An explicit empty body, so the start carries Content-Length: 0.
        upload = call("POST", route + "?uploads", data=b"", content_type=content_type)["upload_id"]
        at = f"{route}?upload_id={urllib.parse.quote(upload, safe='')}"
        try:
            parts, n = [], 0
            while True:
                chunk = f.read(PART_SIZE)
                if not chunk:
                    break
                n += 1
                done = call("PUT", f"{at}&part={n}", data=chunk, content_type="application/octet-stream", timeout=900)
                parts.append({"part": done["part"], "etag": done["etag"]})
            return call("POST", at, body={"parts": parts})
        except ApiError:
            try:  # don't leave a half upload open in R2
                call("DELETE", at)
            except ApiError:
                pass
            raise


if __name__ == "__main__":
    # Smoke check, counts only: python3 worker/lvb_admin.py
    for name in ("students", "submissions", "board-posts", "student-reads", "files"):
        try:
            print(f"{name}: {len(rows(name))} rows")
        except ApiError as e:
            sys.exit(str(e))
