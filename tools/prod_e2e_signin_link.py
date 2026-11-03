"""Live check of sign-in links against production, with throwaway accounts only.

    python3 tools/prod_e2e_signin_link.py seed <workdir>
    python3 tools/prod_e2e_signin_link.py check <workdir>
    python3 tools/prod_e2e_signin_link.py clean <workdir>

seed: the throwaway accounts e2e-test@ (student), e2e-test2@ (classmate) and
e2e-instructor@ (instructor) at learnvibe.build with a 2-hour session each.
Session tokens go to <workdir>/tokens.json (0600), never to stdout.

check: signed out and both students get 401/403 from POST /instructor/signin-link;
the instructor's link signs e2e-test@ in once and is refused the second time;
then e2e-test@ asks for an emailed link (one real send, to our own domain) and
its row and the instructor's student page show the Email Service's answer.
Prints pass/fail lines only: never a link, token or cookie.

clean: deletes exactly those rows (by the three e2e emails) and prints what is left.
"""
import datetime
import hashlib
import http.cookies
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publish_gift_videos as pg  # noqa: E402

API = "https://api.learnvibe.build"
STUDENT, OTHER, PROF = "e2e-test@learnvibe.build", "e2e-test2@learnvibe.build", "e2e-instructor@learnvibe.build"
EMAILS = (STUDENT, OTHER, PROF)
MARKS = ",".join("?" * len(EMAILS))


def ids_by_email():
    return {r["email"]: int(r["id"]) for r in pg.d1(f"SELECT id, email FROM students WHERE email IN ({MARKS})", EMAILS)}


def seed(work):
    os.makedirs(work, mode=0o700, exist_ok=True)
    tokens = {"student": secrets.token_hex(32), "other": secrets.token_hex(32), "prof": secrets.token_hex(32)}
    h = lambda t: hashlib.sha256(t.encode()).hexdigest()  # noqa: E731
    expires = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    for name, email, instr in (("E2E Student", STUDENT, 0), ("E2E Student Two", OTHER, 0), ("E2E Instructor", PROF, 1)):
        pg.d1("INSERT INTO students (name, email, is_instructor) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING",
              (name, email, instr))
    ids = ids_by_email()
    if pg.d1("SELECT is_instructor FROM students WHERE id = ?", (ids[PROF],))[0]["is_instructor"] != 1:
        sys.exit("e2e-instructor@ exists but is not an instructor; not seeding")
    for who, email in (("student", STUDENT), ("other", OTHER), ("prof", PROF)):
        pg.d1("INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)", (h(tokens[who]), ids[email], expires))
    path = os.path.join(work, "tokens.json")
    with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump({"tokens": tokens, "student_id": ids[STUDENT], "other_id": ids[OTHER]}, f)
    print(f"seeded: student id {ids[STUDENT]}, classmate id {ids[OTHER]}, instructor id {ids[PROF]}; tokens in {path}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def call(method, path, cookie=None, body=None, form=None):
    headers = {"User-Agent": "lvb-prod-e2e"}
    data = None
    if cookie:
        headers["Cookie"] = f"lvb_session={cookie}"
    if body is not None:
        data, headers["Content-Type"] = json.dumps(body).encode(), "application/json"
    if form is not None:
        data, headers["Content-Type"] = urllib.parse.urlencode(form).encode(), "application/x-www-form-urlencoded"
    req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    try:
        res = OPENER.open(req, timeout=30)
    except urllib.error.HTTPError as e:
        res = e
    return res.status, res.headers, res.read().decode("utf-8", "replace")


def check(work):
    t = json.load(open(os.path.join(work, "tokens.json")))
    tok, sid = t["tokens"], t["student_id"]
    failed = []

    def ok(name, cond):
        print(("ok   - " if cond else "FAIL - ") + name)
        if not cond:
            failed.append(name)

    mint = lambda cookie: call("POST", "/instructor/signin-link", cookie, {"student_id": sid})  # noqa: E731
    ok("signed out gets 401", mint(None)[0] == 401)
    ok("the student gets 403 (for their own id)", mint(tok["student"])[0] == 403)
    ok("a classmate gets 403", mint(tok["other"])[0] == 403)

    status, headers, body = mint(tok["prof"])
    ok("the instructor gets 200, no-store", status == 200 and headers.get("Cache-Control") == "no-store")
    d = json.loads(body)
    minutes = (datetime.datetime.fromisoformat(d["expires_at"].replace("Z", "+00:00"))
               - datetime.datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))).total_seconds() / 60
    ok("the link lasts 30 minutes", round(minutes) == 30)
    link_token = urllib.parse.parse_qs(urllib.parse.urlparse(d["link"]).query)["token"][0]
    status, _, page = call("GET", f"/auth/callback?token={link_token}")
    ok("opening the link shows the Sign in page", status == 200 and "expires 30 minutes" in page)

    status, headers, _ = call("POST", "/auth/callback", form={"token": link_token})
    jar = http.cookies.SimpleCookie(headers.get("Set-Cookie") or "")
    session = jar["lvb_session"].value if "lvb_session" in jar else None
    ok("first use signs in (302 to /account/ with a session)",
       status == 302 and headers.get("Location") == "https://cu.learnvibe.build/account/" and bool(session))
    me = json.loads(call("GET", "/me", session)[2]) if session else {}
    ok("the session is e2e-test@'s", me.get("email") == STUDENT)
    status, headers, _ = call("POST", "/auth/callback", form={"token": link_token})
    ok("second use is refused (302 to #error=expired, no cookie)",
       status == 302 and headers.get("Location", "").endswith("#error=expired") and not headers.get("Set-Cookie"))
    if session:
        call("POST", "/auth/logout", session)

    # The normal emailed flow: one real send to our own throwaway address.
    status, _, body = call("POST", "/auth/request", body={"email": STUDENT})
    ok("e2e-test@ can still ask for an emailed link (200)", status == 200)
    row = pg.d1("SELECT sent_to, send_status, send_message_id FROM magic_tokens WHERE email = ? "
                "AND sent_to != 'in_person' ORDER BY created_at DESC LIMIT 1", (STUDENT,))
    row = row[0] if row else {}
    ok(f"the row records the send: sent_to={row.get('sent_to')} send_status={row.get('send_status')} "
       f"message id {'present' if row.get('send_message_id') else 'missing'}",
       row.get("send_status") == "sent" and row.get("sent_to") == "email" and bool(row.get("send_message_id")))
    page = json.loads(call("GET", f"/instructor/student?id={sid}", tok["prof"])[2])
    attempts = page.get("signin_attempts") or []
    ok("the instructor's student page lists both attempts with their status",
       [a.get("send_status") for a in attempts[:2]] == ["sent", "shown to instructor"]
       and attempts[1].get("used_at") is not None)
    if row.get("send_message_id"):
        with open(os.open(os.path.join(work, "message_id.txt"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
            f.write(row["send_message_id"])
    print("all checks passed" if not failed else f"{len(failed)} failed")
    return not failed


def clean(work):
    for sql in ("DELETE FROM sessions WHERE student_id IN (SELECT id FROM students WHERE email IN ({m}))",
                "DELETE FROM magic_tokens WHERE email IN ({m})",
                "DELETE FROM students WHERE email IN ({m})"):
        pg.d1(sql.format(m=MARKS), EMAILS)
    left = pg.d1(f"SELECT (SELECT COUNT(*) FROM students WHERE email IN ({MARKS})) s, "
                 f"(SELECT COUNT(*) FROM magic_tokens WHERE email IN ({MARKS})) m", EMAILS + EMAILS)[0]
    print(f"cleaned: e2e students left {left['s']}, e2e magic tokens left {left['m']}")
    tok = os.path.join(work, "tokens.json")
    if os.path.exists(tok):
        os.remove(tok)


if __name__ == "__main__":
    cmd, work = sys.argv[1], os.path.abspath(sys.argv[2])
    if cmd == "seed":
        seed(work)
    elif cmd == "check":
        sys.exit(0 if check(work) else 1)
    else:
        clean(work)
