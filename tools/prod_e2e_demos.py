"""Live check of the final demo sign-up against production, throwaway accounts only.

    python3 tools/prod_e2e_demos.py seed <workdir>
    python3 tools/prod_e2e_demos.py check <workdir>
    python3 tools/prod_e2e_demos.py clean <workdir>

seed: e2e-test@ and e2e-test2@ (students, both in the Worker's DEMO_PREVIEW, so
the sign-up is forced on for them only) and e2e-instructor@ at learnvibe.build,
each with a 2-hour session (tools/prod_e2e_signin_link.py). Tokens go to
<workdir>/tokens.json (0600), never to stdout. Refuses to run while the sign-up
is open to the class, and records the current lock so clean can restore it.

check: API checks of auth, the closed flag, claim, one slot per student and a
taken slot. Leaves no rows behind. The browser flow is tools/e2e_demos.mjs --prod.

clean: deletes the demo_slots rows those accounts or the browser run made, puts
the lock back as it was, then deletes the accounts. Prints what is left.
"""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prod_e2e_signin_link as base  # noqa: E402

pg, call = base.pg, base.call
DAY1, DAY2 = "2026-11-30", "2026-12-04"
GUESTS = ("Visiting Auditor",)  # the guest tools/e2e_demos.mjs adds (and removes)
E2E_LOCK_DAY = "2026-11-01"     # the past lock tools/e2e_demos.mjs sets (9 AM MT) and clears


def settings():
    rows = pg.d1("SELECT signup_open, lock_at FROM demo_settings WHERE id = 1")
    return rows[0] if rows else {"signup_open": 0, "lock_at": None}


def seed(work):
    s = settings()
    if s["signup_open"]:
        sys.exit("the demo sign-up is open to the class; not testing in production now")
    rows = pg.d1("SELECT COUNT(*) AS n FROM demo_slots")[0]["n"]
    if rows:
        sys.exit(f"demo_slots already has {rows} rows; the browser run reorders slots, so not testing over real entries")
    started = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    base.seed(work)
    count = pg.d1("SELECT COUNT(*) AS n FROM demo_slots")[0]["n"]
    with open(os.open(os.path.join(work, "demo_settings.json"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump({"settings": s, "slots_before": count, "started": started}, f)
    print(f"demo sign-up closed; lock {s['lock_at'] or 'none'}; {count} slot rows before the test")


def check(work):
    t = json.load(open(os.path.join(work, "tokens.json")))
    tok = t["tokens"]
    failed = []

    def ok(name, cond):
        print(("ok   - " if cond else "FAIL - ") + name)
        if not cond:
            failed.append(name)

    if settings()["signup_open"]:
        sys.exit("the demo sign-up was opened to the class; stopping (run clean)")
    js = lambda r: json.loads(r[2] or "{}")  # noqa: E731
    ok("signed out: GET /demos is 401", call("GET", "/demos")[0] == 401)
    ok("signed out: /demos/status says not linked (the flag is off)", js(call("GET", "/demos/status")) == {"linked": False})
    ok("signed out: claim is 401", call("POST", "/demos/claim", body={"day": DAY1, "position": 1, "title": "x"})[0] == 401)
    for m, p in (("GET", "/instructor/demos"), ("POST", "/instructor/demos/move"), ("POST", "/instructor/demos/settings"),
                 ("POST", "/instructor/demos/guest"), ("GET", "/instructor/demos/export")):
        body = {} if m == "POST" else None
        ok(f"signed out: {m} {p} is 401", call(m, p, body=body)[0] == 401)
        ok(f"a student: {m} {p} is 403", call(m, p, tok["student"], body=body)[0] == 403)

    st = js(call("GET", "/instructor/demos", tok["prof"]))
    ok("the instructor sees the sign-up closed to the class", st.get("settings", {}).get("signup_open") is False)
    ok("a preview account sees it linked", js(call("GET", "/demos/status", tok["student"])) == {"linked": True})

    s, _, b = call("POST", "/demos/claim", tok["student"], {"day": DAY1, "position": 13, "title": "E2E check"})
    ok("the preview student claims Monday slot 13 (7:05 PM)", s == 200 and json.loads(b)["mine"]["time"] == "7:05 PM")
    s, _, b = call("POST", "/demos/claim", tok["other"], {"day": DAY1, "position": 13, "title": "E2E clash"})
    ok("a classmate gets 409 for the same slot", s == 409 and json.loads(b)["error"] == "slot_taken")
    s, _, b = call("POST", "/demos/claim", tok["student"], {"day": DAY2, "position": 13, "title": "E2E check moved"})
    mine = pg.d1("SELECT day, position FROM demo_slots WHERE student_id = ?", (t["student_id"],))
    ok("claiming again moves them: one row, now Friday slot 13", s == 200 and mine == [{"day": DAY2, "position": 13}])
    seen = js(call("GET", "/demos", tok["other"]))
    slot = seen["days"][1]["slots"][12]
    ok("the classmate sees a first name and title only", slot.get("name") == "E2E" and "student_id" not in slot and "id" not in slot)
    ok("release works", call("DELETE", "/demos/claim", tok["student"])[0] == 200)
    ok("no e2e rows left", not pg.d1("SELECT 1 FROM demo_slots WHERE student_id IN (?, ?)", (t["student_id"], t["other_id"])))
    print("all checks passed" if not failed else f"{len(failed)} failed")
    return not failed


def clean(work):
    ids = list(base.ids_by_email().values())
    if ids:
        pg.d1(f"DELETE FROM demo_slots WHERE student_id IN ({','.join('?' * len(ids))})", ids)
    saved_path = os.path.join(work, "demo_settings.json")
    saved = json.load(open(saved_path)) if os.path.exists(saved_path) else None
    if saved:
        # Only the guest the browser run added, and only since the seed.
        pg.d1(f"DELETE FROM demo_slots WHERE guest_name IN ({','.join('?' * len(GUESTS))}) AND created_at >= ?",
              GUESTS + (saved["started"],))
        # The browser run sets a lock on 2026-11-01 and clears it; a failed run can leave it on, which would lock
        # every student out. Put back what was there before, unless someone set a different lock meanwhile.
        before, now_lock = saved["settings"]["lock_at"], settings()["lock_at"]
        if now_lock is None or now_lock.startswith(E2E_LOCK_DAY):
            pg.d1("UPDATE demo_settings SET lock_at = ? WHERE id = 1", (before,))
        os.remove(saved_path)
    base.clean(work)
    now = settings()
    count = pg.d1("SELECT COUNT(*) AS n FROM demo_slots")[0]["n"]
    print(f"demo sign-up open: {bool(now['signup_open'])}; lock: {now['lock_at'] or 'none'}; slot rows now {count}"
          + (f" (before the test: {saved['slots_before']})" if saved else ""))


if __name__ == "__main__":
    cmd, work = sys.argv[1], os.path.abspath(sys.argv[2])
    if cmd == "seed":
        seed(work)
    elif cmd == "check":
        sys.exit(0 if check(work) else 1)
    else:
        clean(work)
