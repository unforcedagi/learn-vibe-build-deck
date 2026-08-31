#!/usr/bin/env python3
"""Uni's editing tool for instructor "reads" on the class site.

Usage:
  python3 lvb-read.py push <week> <slug> --title "..." [--audience instructor|class] [--file body.md]
      Body comes from --file, or stdin when --file is omitted. Upserts by (week, slug).
  python3 lvb-read.py list
  python3 lvb-read.py rm <week> <slug>

Auth: reads the admin key from ~/.config/lvb/admin.key (the ADMIN_KEY Worker
secret). The key is never printed, logged, or passed via argv. API base can be
overridden with LVB_API (default https://api.learnvibe.build).

Stdlib only, so a future MCP wrapper can shell out to it or lift the ~40 lines
of HTTP directly.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API_BASE = os.environ.get("LVB_API", "https://api.learnvibe.build")
KEY_PATH = os.path.expanduser("~/.config/lvb/admin.key")


def admin_key():
    try:
        with open(KEY_PATH) as f:
            key = f.read().strip()
    except FileNotFoundError:
        sys.exit(f"error: no admin key at {KEY_PATH}")
    if not key:
        sys.exit(f"error: {KEY_PATH} is empty")
    return key


def request(method, path, body=None):
    req = urllib.request.Request(
        API_BASE + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Bearer " + admin_key(),
            "Content-Type": "application/json",
            # Cloudflare's browser integrity check 403s urllib's default
            # "Python-urllib/3.x" UA with error 1010; any honest UA passes.
            "User-Agent": "lvb-read/1.0 (uni admin tool)",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        sys.exit(f"error: {method} {path} -> HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:
        sys.exit(f"error: {method} {path} -> {e.reason}")


def cmd_push(args):
    if args.file:
        with open(args.file) as f:
            body = f.read()
    else:
        if sys.stdin.isatty():
            print("(reading body from stdin — end with Ctrl-D)", file=sys.stderr)
        body = sys.stdin.read()
    if not body.strip():
        sys.exit("error: empty body — pass markdown on stdin or via --file")

    out = request("POST", "/admin/reads", {
        "week": args.week,
        "slug": args.slug,
        "title": args.title,
        "audience": args.audience,
        "body": body,
    })
    r = out.get("read", {})
    print(f"pushed week {r.get('week')} / {r.get('slug')} "
          f"[{r.get('audience')}] \"{r.get('title')}\" (id {r.get('id')})")


def cmd_list(_args):
    out = request("GET", "/admin/reads")
    reads = out.get("reads", [])
    if not reads:
        print("no reads yet")
        return
    for r in reads:
        print(f"week {r['week']:>2}  {r['slug']:<16} [{r['audience']:<10}] "
              f"{r.get('body_bytes') or 0:>6}B  {r.get('updated_at') or '':<20.20}  "
              f"{r.get('title') or ''}")


def cmd_rm(args):
    request("DELETE", f"/admin/reads/{args.week}/{args.slug}")
    print(f"deleted week {args.week} / {args.slug}")


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    push = sub.add_parser("push", help="create or update a read (body on stdin or --file)")
    push.add_argument("week", type=int)
    push.add_argument("slug")
    push.add_argument("--title", required=True)
    push.add_argument("--audience", choices=["instructor", "class"], default="instructor")
    push.add_argument("--file", help="read body from this file instead of stdin")
    push.set_defaults(fn=cmd_push)

    ls = sub.add_parser("list", help="list all reads")
    ls.set_defaults(fn=cmd_list)

    rm = sub.add_parser("rm", help="delete a read")
    rm.add_argument("week", type=int)
    rm.add_argument("slug")
    rm.set_defaults(fn=cmd_rm)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
