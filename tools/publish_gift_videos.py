"""Put each student's gift video on their account page (private R2 bucket lvb-gift-videos).

    python3 tools/publish_gift_videos.py                  # dry run: what is ready, what would upload
    python3 tools/publish_gift_videos.py --go             # upload what is ready and new or changed
    python3 tools/publish_gift_videos.py --go --verify-bytes   # also read every stored video back (sha256)

Safe to re-run: a video already stored with the same bytes (size and MD5 etag) is skipped, a
re-rendered one replaces the old object. The Worker serves gift/<student_id>.mp4 at /gift/<id>
only to that student's own session or an instructor (worker/src/index.js, handleGift).

Ready = a row of the gift batch's status.json whose status says "published" and whose URL names
a gift2-s<id>-<sha8>.mp4 file that exists in the uni-publish directory with that sha256 prefix.
The row key is the course-site student id (students.id, from the D1 export the videos were made
from). Every mapping is checked before upload, never guessed: the export row for that id has the
same Canvas user id and name as production D1 today, the row's first name matches, the student
is not an instructor and has a roster email, and the video's script was written for that id. A
row that fails any check is skipped and listed by id; the run then exits 1.

Output names students by id only. No names, emails or URLs are printed.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

GIFTS = Path.home() / "Code/teaching/week9/gift-videos"
STATUS = GIFTS / "v2/batch/status.json"
EXPORT = GIFTS / "data/d1.json"
STUDENTS = GIFTS / "students"
SERVE_DIR = Path(os.environ.get("UNI_PUBLISH_DIR", Path.home() / ".local/share/uni/videos"))

ACCOUNT_ID = "8f2a7eb9d5e21ffa902a76cf62975c82"
D1_ID = "80abf459-bac5-437c-820b-b9c38fac2c0b"  # lvb-accounts
BUCKET = "lvb-gift-videos"
CF = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}"


def key_for(student_id):
    return f"gift/{int(student_id)}.mp4"


# ---------------------------------------------------------------------------- Cloudflare

def token():
    """CLOUDFLARE_API_TOKEN from the environment, else the Hermes .env. Never printed."""
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        return os.environ["CLOUDFLARE_API_TOKEN"]
    with open(Path.home() / ".hermes/.env") as f:
        for line in f:
            k, sep, v = line.strip().partition("=")
            if sep and k == "CLOUDFLARE_API_TOKEN":
                return v.strip().strip('"').strip("'")
    sys.exit("CLOUDFLARE_API_TOKEN not set and not in ~/.hermes/.env")


def cf(method, path, body=None, headers=None, raw=False, timeout=300):
    req = urllib.request.Request(CF + path, data=body, method=method, headers={
        "Authorization": f"Bearer {token()}", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            data = res.read()
    except urllib.error.HTTPError as e:
        if raw and e.code == 404:
            return None
        sys.exit(f"Cloudflare {method} {path.split('?')[0]} -> {e.code}: {e.read()[:300]!r}")
    if raw:
        return data
    out = json.loads(data)
    if not out.get("success"):
        sys.exit(f"Cloudflare {method} {path.split('?')[0]} failed: {out.get('errors')}")
    return out


def d1(sql, params=()):
    body = json.dumps({"sql": sql, "params": list(params)}).encode()
    out = cf("POST", f"/d1/database/{D1_ID}/query", body, {"Content-Type": "application/json"})
    return out["result"][0]["results"]


def obj_path(key):
    return f"/r2/buckets/{BUCKET}/objects/{urllib.parse.quote(key, safe='')}"


def stored_objects(prefix="gift/"):
    """{key: {"size": int, "etag": str}} for everything under prefix (internal listing; the bucket has no public URL)."""
    out, cursor = {}, None
    while True:
        q = {"prefix": prefix, "per_page": 1000, **({"cursor": cursor} if cursor else {})}
        res = cf("GET", f"/r2/buckets/{BUCKET}/objects?{urllib.parse.urlencode(q)}")
        for o in res["result"]:
            out[o["key"]] = {"size": int(o["size"]), "etag": o["etag"].strip('"')}
        cursor = (res.get("result_info") or {}).get("cursor")
        if not cursor or not (res.get("result_info") or {}).get("is_truncated"):
            return out


def put_object(key, path):
    data = Path(path).read_bytes()
    res = cf("PUT", obj_path(key), data, {"Content-Type": "video/mp4"})
    return {"size": int(res["result"]["size"]), "etag": res["result"]["etag"].strip('"')}


def get_object(key):
    return cf("GET", obj_path(key), raw=True)


def delete_object(key):
    cf("DELETE", obj_path(key))


# ---------------------------------------------------------------------------- what is ready

def digests(path):
    sha, md5, size = hashlib.sha256(), hashlib.md5(), 0
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            sha.update(chunk); md5.update(chunk); size += len(chunk)
    return {"sha256": sha.hexdigest(), "md5": md5.hexdigest(), "size": size}


def ready_rows(status):
    """{student_id: row} for the rows whose video is published."""
    out = {}
    for k, row in status["rows"].items():
        st = (row.get("status") or "").lower()
        if "published" in st and not re.search(r"unpublished|not published|fail", st) \
                and (row.get("url") or "").endswith(".mp4"):
            out[int(k)] = row
    return out


def local_file(sid, url):
    """The published file for this id, or (None, reason). Checks the id and sha8 in the file name."""
    name = url.rsplit("/", 1)[-1]
    stem = f"gift2-s{sid}-"
    if not name.startswith(stem):
        return None, "file name is for another id"
    sha8 = name[len(stem):-len(".mp4")]
    if not re.fullmatch(r"[0-9a-f]{8,64}", sha8):
        return None, "file name has no sha256 prefix"
    path = SERVE_DIR / name
    if not path.is_file():
        return None, "published file missing"
    d = digests(path)
    if not d["sha256"].startswith(sha8):
        return None, "file bytes do not match the published sha256"
    return {"path": path, **d}, None


def first(name):
    return (name or "").strip().split()[0].lower() if (name or "").strip() else ""


def mapping_problem(sid, row, export_by_id, prod_by_id, script):
    """None when status row -> course-site student id is proven; else the reason (no names)."""
    exp, prod = export_by_id.get(sid), prod_by_id.get(sid)
    if not exp:
        return "id not in the export the videos were made from"
    if not prod:
        return "id not in production D1"
    if prod["is_instructor"]:
        return "id is an instructor"
    if not prod.get("email"):
        return "no roster email"
    if not exp.get("canvas_id") or str(exp["canvas_id"]) != str(prod["canvas_id"] or ""):
        return "Canvas user id differs between the export and production"
    if (exp.get("name") or "").strip() != (prod.get("name") or "").strip():
        return "name differs between the export and production"
    if first(row.get("name")) != first(prod["name"]):
        return "status row's first name differs from production"
    if script is None:
        return "no v2.json script for this id"
    if int(script.get("student_id", -1)) != sid or first(script.get("first_name")) != first(prod["name"]):
        return "the video's script was made for someone else"
    return None


def load_script(sid):
    p = STUDENTS / str(sid) / "v2.json"
    return json.loads(p.read_text()) if p.is_file() else None


# ---------------------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--go", action="store_true", help="upload (default is a dry run)")
    ap.add_argument("--verify-bytes", action="store_true", help="read every stored video back and compare sha256")
    a = ap.parse_args(argv)

    ready = ready_rows(json.loads(STATUS.read_text()))
    export_by_id = {int(s["id"]): s for s in json.loads(EXPORT.read_text())["students"]}
    ids = sorted(ready)
    prod_by_id = {}
    if ids:
        marks = ",".join("?" * len(ids))
        for r in d1(f"SELECT id, canvas_id, name, email, is_instructor FROM students WHERE id IN ({marks})", ids):
            prod_by_id[int(r["id"])] = r

    skipped, todo, current = {}, [], []
    stored = stored_objects()
    for sid in ids:
        why = mapping_problem(sid, ready[sid], export_by_id, prod_by_id, load_script(sid))
        f, ferr = (None, None) if why else local_file(sid, ready[sid]["url"])
        if why or ferr:
            skipped[sid] = why or ferr
            continue
        have = stored.get(key_for(sid))
        if have and have["size"] == f["size"] and have["etag"] == f["md5"]:
            current.append((sid, f))
        else:
            todo.append((sid, f))

    print(f"ready rows in status.json: {len(ids)}; mapped and verified: {len(todo) + len(current)}; "
          f"already stored: {len(current)}; to upload: {len(todo)}; skipped: {len(skipped)}")
    for sid, why in skipped.items():
        print(f"  skipped s{sid}: {why}")
    if not a.go:
        print("dry run; pass --go to upload: " + ", ".join(f"s{s}" for s, _ in todo) if todo else "dry run; nothing to upload")
        return 1 if skipped else 0

    for sid, f in todo:
        got = put_object(key_for(sid), f["path"])
        if got["size"] != f["size"] or got["etag"] != f["md5"]:
            sys.exit(f"s{sid}: stored object does not match the local file (size/etag)")
        print(f"  uploaded s{sid} ({f['size'] / 1e6:.1f} MB, md5 ok)")

    stored = stored_objects()
    good = [sid for sid, f in todo + current
            if stored.get(key_for(sid), {}).get("size") == f["size"] and stored[key_for(sid)]["etag"] == f["md5"]]
    print(f"stored and matching (size + md5): {len(good)} of {len(todo) + len(current)}")
    if a.verify_bytes:
        n = 0
        for sid, f in todo + current:
            data = get_object(key_for(sid))
            if data is None or hashlib.sha256(data).hexdigest() != f["sha256"]:
                sys.exit(f"s{sid}: stored bytes differ from the local file (sha256)")
            n += 1
        print(f"read back and sha256 matching: {n} of {len(todo) + len(current)}")
    others = sorted(k for k in stored if k not in {key_for(s) for s, _ in todo + current})
    if others:
        print(f"other objects in the bucket (not from status.json): {', '.join(others)}")
    return 1 if skipped or len(good) != len(todo) + len(current) else 0


if __name__ == "__main__":
    sys.exit(main())
