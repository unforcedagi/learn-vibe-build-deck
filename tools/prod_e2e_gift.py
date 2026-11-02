"""Seed or remove the production e2e fixture for gift videos.

    python3 tools/prod_e2e_gift.py seed <workdir> <test.mp4>
    PLAYWRIGHT=... node tools/e2e_gift.mjs <test.mp4> <shots-dir> --prod <workdir>/tokens.json
    python3 tools/prod_e2e_gift.py clean <workdir>

seed: the throwaway accounts e2e-test@ (owner), e2e-test2@ (classmate) and e2e-instructor@
(instructor) at learnvibe.build, a 2-hour session for each, and the test video uploaded to
the private bucket as e2e-test@'s gift (gift/<its id>.mp4). Session tokens go to
<workdir>/tokens.json (0600), never to stdout.

clean: deletes exactly those rows (by the three e2e emails) and that one object, then prints
what is left, which must be 0. No real student's row or video is read or written.
"""
import datetime
import hashlib
import json
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publish_gift_videos as pg  # noqa: E402

OWNER, OTHER, PROF = "e2e-test@learnvibe.build", "e2e-test2@learnvibe.build", "e2e-instructor@learnvibe.build"
EMAILS = (OWNER, OTHER, PROF)
MARKS = ",".join("?" * len(EMAILS))


def ids_by_email():
    return {r["email"]: int(r["id"]) for r in pg.d1(f"SELECT id, email FROM students WHERE email IN ({MARKS})", EMAILS)}


def seed(work, video):
    os.makedirs(work, mode=0o700, exist_ok=True)
    tokens = {"owner": secrets.token_hex(32), "other": secrets.token_hex(32), "prof": secrets.token_hex(32)}
    h = lambda t: hashlib.sha256(t.encode()).hexdigest()  # noqa: E731
    expires = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    for name, email, instr in (("E2E Student", OWNER, 0), ("E2E Student Two", OTHER, 0), ("E2E Instructor", PROF, 1)):
        pg.d1("INSERT INTO students (name, email, is_instructor) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING",
              (name, email, instr))
    ids = ids_by_email()
    if pg.d1("SELECT is_instructor FROM students WHERE id = ?", (ids[PROF],))[0]["is_instructor"] != 1:
        sys.exit("e2e-instructor@ exists but is not an instructor; not seeding")
    for who, email in (("owner", OWNER), ("other", OTHER), ("prof", PROF)):
        pg.d1("INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)", (h(tokens[who]), ids[email], expires))
    key = pg.key_for(ids[OWNER])
    if pg.stored_objects(key):
        sys.exit(f"{key} already holds a video; not overwriting it (clean will not touch it either)")
    path = os.path.join(work, "tokens.json")
    with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump({"tokens": tokens, "owner_id": ids[OWNER], "other_id": ids[OTHER], "key": key}, f)
    got = pg.put_object(key, video)
    d = pg.digests(video)
    if got["size"] != d["size"] or got["etag"] != d["md5"]:
        sys.exit("test video stored with different bytes")
    print(f"seeded: owner id {ids[OWNER]}, classmate id {ids[OTHER]}, instructor id {ids[PROF]}; "
          f"test video at {key} ({d['size']} bytes); tokens in {path}")


def clean(work):
    # Only the one object seed wrote (its key is in tokens.json); never a key guessed from an id.
    tok = os.path.join(work, "tokens.json")
    key = json.load(open(tok))["key"] if os.path.exists(tok) else None
    # ...and only while that id is still the e2e owner's (a stale tokens.json must not hit a real student).
    if key and key == pg.key_for(ids_by_email().get(OWNER, -1)) and pg.stored_objects(key):
        pg.delete_object(key)
    for sql in ("DELETE FROM sessions WHERE student_id IN (SELECT id FROM students WHERE email IN ({m}))",
                "DELETE FROM magic_tokens WHERE email IN ({m})",
                "DELETE FROM students WHERE email IN ({m})"):
        pg.d1(sql.format(m=MARKS), EMAILS)
    left_rows = pg.d1(f"SELECT COUNT(*) n FROM students WHERE email IN ({MARKS})", EMAILS)[0]["n"]
    left_objs = len(pg.stored_objects(key)) if key else "unknown (no tokens.json)"
    print(f"cleaned: e2e students left {left_rows}, test video objects left {left_objs}")
    if os.path.exists(tok):
        os.remove(tok)


if __name__ == "__main__":
    if sys.argv[1] == "seed":
        seed(os.path.abspath(sys.argv[2]), sys.argv[3])
    else:
        clean(os.path.abspath(sys.argv[2]))
