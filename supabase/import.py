#!/usr/bin/env python3
"""Seed the Learn, Vibe, Build roster into Supabase.

Reads a LOCAL seed file (never committed to this repo) at:

    ~/.scratch/lvb-accounts/seed.json

which is a JSON array of objects:

    [
      {
        "canvas_id": 123456,
        "name": "Ada Lovelace",
        "email": "ada.lovelace@colorado.edu",
        "week1_submitted_at": "2026-08-26T19:04:00-06:00",  # optional
        "week1_body": "My reflection text..."               # optional
      },
      ...
    ]

For each entry it:
  1. creates a *confirmed* auth user (no password — magic-link only),
  2. upserts the matching public.profiles row,
  3. inserts a week-1 submission if week1_body is present.

Idempotent: existing auth users (matched by email) are reused, profiles are
upserted, and a week-1 submission is only inserted if none exists yet for
that student.

Credentials come from the environment and are never printed:

    export SUPABASE_URL="https://<project-ref>.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="..."   # Dashboard > Settings > API
    python3 supabase/import.py

Stdlib only — no pip install needed.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SEED_PATH = os.path.expanduser("~/.scratch/lvb-accounts/seed.json")


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def request(method: str, url: str, key: str, body=None, headers=None):
    """Make an authenticated JSON request; return (status, parsed-json-or-None)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except (ValueError, TypeError):
            return e.code, {"raw": raw.decode(errors="replace")}


def list_existing_users(base: str, key: str) -> dict:
    """Return {email(lower): user_id} for every existing auth user."""
    users = {}
    page = 1
    while True:
        status, data = request(
            "GET", f"{base}/auth/v1/admin/users?page={page}&per_page=100", key
        )
        if status != 200:
            die(f"listing auth users failed (HTTP {status}): {data}")
        batch = data.get("users", data) or []
        for u in batch:
            if u.get("email"):
                users[u["email"].lower()] = u["id"]
        if len(batch) < 100:
            return users
        page += 1


def main() -> None:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        die("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment")

    if not os.path.exists(SEED_PATH):
        die(f"seed file not found: {SEED_PATH}")
    with open(SEED_PATH) as f:
        seed = json.load(f)
    if not isinstance(seed, list):
        die("seed.json must be a JSON array")

    existing = list_existing_users(base, key)
    print(f"{len(existing)} auth user(s) already exist; seeding {len(seed)} entries")

    created = reused = profiles = subs = skipped_subs = 0

    for entry in seed:
        email = (entry.get("email") or "").strip().lower()
        if not email:
            print("  ! skipping entry with no email")
            continue

        # -- 1. auth user (confirmed, passwordless) --------------------------
        if email in existing:
            user_id = existing[email]
            reused += 1
        else:
            status, data = request(
                "POST",
                f"{base}/auth/v1/admin/users",
                key,
                body={"email": email, "email_confirm": True},
            )
            if status not in (200, 201):
                print(f"  ! {email}: creating auth user failed (HTTP {status}): {data}")
                continue
            user_id = data["id"]
            existing[email] = user_id
            created += 1

        # -- 2. profile row (upsert on pk, so re-runs are safe) --------------
        status, data = request(
            "POST",
            f"{base}/rest/v1/profiles?on_conflict=id",
            key,
            body={
                "id": user_id,
                "canvas_id": entry.get("canvas_id"),
                "name": entry.get("name"),
                "email": email,
            },
            headers={"Prefer": "resolution=merge-duplicates"},
        )
        if status not in (200, 201, 204):
            print(f"  ! {email}: profile upsert failed (HTTP {status}): {data}")
            continue
        profiles += 1

        # -- 3. week-1 submission (only if body present, only once) ----------
        body = entry.get("week1_body")
        if not body:
            continue
        status, data = request(
            "GET",
            f"{base}/rest/v1/submissions?profile_id=eq.{user_id}&week=eq.1&select=id",
            key,
        )
        if status != 200:
            print(f"  ! {email}: checking week-1 submission failed (HTTP {status}): {data}")
            continue
        if data:
            skipped_subs += 1
            continue
        row = {"profile_id": user_id, "week": 1, "body": body, "visibility": "private"}
        if entry.get("week1_submitted_at"):
            row["submitted_at"] = entry["week1_submitted_at"]
        status, data = request("POST", f"{base}/rest/v1/submissions", key, body=row)
        if status not in (200, 201, 204):
            print(f"  ! {email}: inserting week-1 submission failed (HTTP {status}): {data}")
            continue
        subs += 1

    print(
        f"done: {created} auth user(s) created, {reused} reused, "
        f"{profiles} profile(s) upserted, {subs} week-1 submission(s) inserted, "
        f"{skipped_subs} already present"
    )


if __name__ == "__main__":
    main()
