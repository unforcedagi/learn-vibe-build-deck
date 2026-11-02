"""Seed or remove the production e2e fixture for the instructor files view.

    uv run -q --no-project --with html2text python3 tools/prod_e2e_instructor_files.py seed <workdir>
    PLAYWRIGHT=... node tools/e2e_instructor_files.mjs <shots-dir> --prod <workdir>/tokens.json
    uv run -q --no-project --with html2text python3 tools/prod_e2e_instructor_files.py clean <workdir>

seed: the throwaway accounts e2e-test@learnvibe.build (student) and
e2e-instructor@learnvibe.build (instructor), a 2-hour session for each, a
Week 9 submission for the student, and the invented upload fixtures rendered
by the real pipeline (worker/submission_files.py) into D1 and the private R2
bucket under files/e2e-fixture-*/. Session tokens go to <workdir>/tokens.json
(0600), never to stdout.

clean: deletes exactly those rows (by the two e2e emails and the e2e-fixture
file ids) and objects, then prints the remaining counts, which must be 0.
No real student's row is read or written.
"""
import hashlib
import json
import os
import secrets
import subprocess
import sys
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "worker"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import resync  # noqa: E402
import submission_files as sf  # noqa: E402
import instructor_files_fixture  # noqa: E402

STUDENT = "e2e-test@learnvibe.build"
INSTRUCTOR = "e2e-instructor@learnvibe.build"
EMAILS = f"('{STUDENT}', '{INSTRUCTOR}')"
q = sf._q


def seed(work):
    os.makedirs(work, mode=0o700, exist_ok=True)
    instructor_files_fixture.main(work)
    with open(os.path.join(work, "manifest.json")) as f:
        manifest = json.load(f)
    tokens = {"prof": secrets.token_hex(32), "student": secrets.token_hex(32)}
    h = lambda t: hashlib.sha256(t.encode()).hexdigest()  # noqa: E731
    now = datetime.datetime.now(datetime.timezone.utc)
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")  # noqa: E731
    expires = iso(now + datetime.timedelta(hours=2))
    canvas_url = manifest["rows"][0]["canvas_url"]
    body = ("E2E-W9 invented progress report: the artifact, plan and build are attached.\n\n"
            + "\n\n---\n\n".join(f"**Uploaded: [{r['name']}]({r['canvas_url']})**\n\nE2E extracted copy" for r in manifest["rows"]))
    stmts = [
        f"INSERT INTO students (name, email, is_instructor) VALUES ('E2E Student', '{STUDENT}', 0) ON CONFLICT (email) DO NOTHING;",
        f"INSERT INTO students (name, email, is_instructor) VALUES ('E2E Instructor', '{INSTRUCTOR}', 1) ON CONFLICT (email) DO NOTHING;",
        f"INSERT INTO sessions (token_hash, student_id, expires_at) SELECT '{h(tokens['student'])}', id, '{expires}' FROM students WHERE email = '{STUDENT}';",
        f"INSERT INTO sessions (token_hash, student_id, expires_at) SELECT '{h(tokens['prof'])}', id, '{expires}' FROM students WHERE email = '{INSTRUCTOR}' AND is_instructor = 1;",
        f"INSERT INTO submissions (student_id, week, body, submitted_at, link_url) SELECT id, 9, {q(body)}, '{iso(now)}', {q(canvas_url)} FROM students WHERE email = '{STUDENT}';",
    ]
    for r in manifest["rows"]:
        stmts.append(
            "INSERT INTO submission_files (student_id, week, canvas_file_id, position, name, content_type, size, kind, "
            "text, pages, rendition, rendition_type, canvas_url, status, render_version, updated_at) "
            f"SELECT id, 9, {q(r['canvas_file_id'])}, {int(r['position'])}, {q(r['name'])}, {q(r['content_type'])}, "
            f"{int(r['size'])}, {q(r['kind'])}, {q(r['text'])}, {int(r['pages'])}, {q(r['rendition'])}, "
            f"{q(r['rendition_type'])}, {q(r['canvas_url'])}, {q(r['status'])}, {sf.RENDER_VERSION}, '{iso(now)}' "
            f"FROM students WHERE email = '{STUDENT}';")
    sf.r2_bulk_put([(o["key"], o["file"]) for o in manifest["objects"]], resync.wrangler_env(), resync.WORKER_DIR)
    resync.run_wrangler_d1("\n".join(stmts))
    student_id = resync.d1_select(f"SELECT id FROM students WHERE email = '{STUDENT}'")[0]["id"]
    path = os.path.join(work, "tokens.json")
    with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump({"tokens": tokens, "student_id": student_id}, f)
    print(f"seeded: e2e student id {student_id}, {len(manifest['rows'])} files, "
          f"{len(manifest['objects'])} objects; tokens in {path}")


def clean(work):
    with open(os.path.join(work, "manifest.json")) as f:
        manifest = json.load(f)
    ids = f"(SELECT id FROM students WHERE email IN {EMAILS})"
    resync.run_wrangler_d1("\n".join([
        "DELETE FROM submission_files WHERE canvas_file_id LIKE 'e2e-fixture-%';",
        f"DELETE FROM submission_files WHERE student_id IN {ids};",
        f"DELETE FROM submissions WHERE student_id IN {ids};",
        f"DELETE FROM sessions WHERE student_id IN {ids};",
        f"DELETE FROM student_reads WHERE student_id IN {ids};",
        f"DELETE FROM magic_tokens WHERE email IN {EMAILS};",
        f"DELETE FROM students WHERE email IN {EMAILS};",
    ]))
    for o in manifest["objects"]:
        subprocess.run(["npx", "-y", "wrangler", "r2", "object", "delete", f"{sf.R2_BUCKET}/{o['key']}", "--remote"],
                       cwd=resync.WORKER_DIR, env=resync.wrangler_env(), capture_output=True, text=True, timeout=120, check=True)
    left = resync.d1_select(
        f"SELECT (SELECT COUNT(*) FROM students WHERE email IN {EMAILS}) students, "
        "(SELECT COUNT(*) FROM submission_files WHERE canvas_file_id LIKE 'e2e-fixture-%') files")[0]
    print(f"cleaned: {len(manifest['objects'])} objects deleted; left: {left}")
    tok = os.path.join(work, "tokens.json")
    if os.path.exists(tok):
        os.remove(tok)


if __name__ == "__main__":
    {"seed": seed, "clean": clean}[sys.argv[1]](os.path.abspath(sys.argv[2]))
