# Progress: LVB timers off the broad Cloudflare token (T-121, attempt u04y7ez8)

## Where the timers touched D1 or the token (before)
| Timer | Code | What it did with the token |
|---|---|---|
| lvb-canvas-sync | `worker/resync.py` | `wrangler_env()` read `CLOUDFLARE_API_TOKEN` from `~/.hermes/.env`; `run_wrangler_d1` upserted students + submissions; `d1_select` read file ids and canvas ids; `run_wrangler_d1_batched` upserted/pruned `submission_files` |
| lvb-canvas-sync | `worker/submission_files.py` | `r2_bulk_put` wrote page images and renditions to R2 `lvb-instructor-files` |
| lvb-canvas-sync | `worker/student_reads.py` | `wrangler()` read students, submissions, board posts, read hashes; `d1_write` upserted `student_reads` |
| lvb-reader-sync | `~/agents/uni-hermes/teaching/reader/sync.py` | `d1()` read submissions joined with students |
| lvb-reader-sync | `.../reader/resync_lib.py` | `run_wrangler_d1` (unused by the timer, read `~/.config/cloudflare/token`, which no longer exists) |
| lvb-final-plans-sync | `~/Code/teaching/final-plans/bin/sync.py` | `d1()` read Week 9+ submissions; `bin/survey.py` (manual) reused it |

None of the three unit files sets `CLOUDFLARE_API_TOKEN` in `Environment=`; the scripts read it themselves.

## Done
- Worker `GET /admin/sync/{students,submissions,board-posts,student-reads,files}`, `POST /admin/sync/{canvas,student-reads,files}`,
  `PUT|POST /admin/sync/object/files/<id>/(p<n>.jpg|rendition)` (multipart over 90 MB). Admin key only: no key 401,
  any session 403 (the instructor's too). The Canvas upsert keeps "fill only rows with no writing".
  Tests: `worker/test/admin-sync.test.mjs` (8). Removing the key check, the 403 branch, or the no-overwrite WHERE each
  turned a test red.
- `worker/lvb_admin.py` client; `resync.py`, `student_reads.py`, `submission_files.py` use it. No token, no wrangler.
- `tools/prod_e2e_instructor_files.py` (manual) keeps wrangler, but only with a key in the environment (run under cf-job).
- Reader + final-plans: those folders are read-only to this run, so the change is a patch:
  `~/Builders/lvb-timer-patches-u04y7ez8/` (`new/`, `orig/`, `timers-off-broad-token.patch`, `apply.sh`, `--undo`).
  Both get `--dry-run`. `~/Code/teaching/week10/pods/check.py` and `d1q.py` (ad-hoc SQL through the reader's
  `sync.d1`) stop working after apply; see the patch README.
- End to end on a local `wrangler dev` (local D1/R2, throwaway key): real Canvas -> resync -> 25 roster rows,
  204 submissions; a site row kept its text, an emptied row was refilled; `--files --week 10`: 13 files, 24 objects,
  each served by `/instructor/file/...` to a local instructor session; rerun skipped all 13; a 95 MB multipart
  upload came back byte-identical; student_reads write + dry run; reader and final-plans dry runs read the rows.
  Local state deleted afterwards.

## Baseline counts (before the change)
- `resync.py --dry-run` (11-10, old code): weeks 1-10, roster 25, per week 24/25/22/8/22/23/21/17/22/20 (204).
  Its last line said "3836 SQL statements built": that counted newlines inside student text. The new line says
  "25 roster rows and 204 submissions built".
- `resync.py --files --dry-run`: 115 uploads across weeks 1-10.
- `student_reads.py` (06:00 run, journal): 25 students with submissions, 23 skipped, 2 to generate
  (both failed in `claude` with RuntimeError: a separate, existing problem; the unit then failed, so `--files` didn't run).
- Reader (06:30 `data/sync.log`): roster 25, site rows 208, unmatched 0.
- Final plans (`data/sync-run.log`, last): students 25, week 9 items 24, pieces 42, later items 21, pods matched 25.
- The old D1 dry runs can't be re-run here: `~/.hermes/.env` is closed to this run.

## Next (Uni), in order. Not Mon 5:05-7:35 PM MT.
1. ztycfm8j's backup + `0011_demo_slots.sql` migration must be done first (its PROGRESS-demo-signup.md steps 1-2):
   main already carries #48, so this deploy ships the demo code too (flag off), and /demos needs those tables.
2. Merge this PR (CI green). Do NOT pull the main checkout yet: lvb-canvas-sync runs from
   `~/Code/learn-vibe-build-deck`, and the new scripts get 404 from the old Worker until the deploy is live.
3. Deploy from a fresh clone of main, as ONE command: the card is only posted if the clone and the token-free
   build (which also warms npx) succeed, and the job itself cd's into that clone.
   ```sh
   D=$(mktemp -d) && git clone -q --depth 1 https://github.com/unforcedagi/learn-vibe-build-deck "$D" \
     && (cd "$D/worker" && npx -y wrangler@4 deploy --dry-run >/dev/null) && echo build-ok \
     && ~/Code/uni-ops/bin/cf-job --account unforced --template workers-scripts-write \
       --purpose "LVB: deploy lvb-accounts with /admin/sync so 3 class timers drop the broad token (T-121); includes demo sign-up PR 48, off" \
       -- sh -c "cd '$D/worker' && npx -y wrangler@4 deployments list | tail -12 && npx -y wrangler@4 deploy"
   ```
   The list printed first holds the rollback version id; the deploy prints the new one.
   Card (rendered offline with sealed/card_text.py; the account name comes from the broker's list):
   > 🔴 Unforced Development — PRODUCTION account · all of it · 5 min
   > Can: deploy any Worker (account-wide). Revoked at the end; lookups too.
   > Uni says: LVB: deploy lvb-accounts with /admin/sync so 3 class timers drop the broad token (T-121); includes demo sign-up PR 48, off
4. Check, no token: `curl -s -o /dev/null -w '%{http_code}\n' https://api.learnvibe.build/admin/sync/students` -> 401;
   then `git -C ~/Code/learn-vibe-build-deck pull --ff-only` and `python3 ~/Code/learn-vibe-build-deck/worker/lvb_admin.py` -> row counts.
5. `sh ~/Builders/lvb-timer-patches-u04y7ez8/apply.sh` (reader + final-plans; it checks the API answers first).
6. Resume u04y7ez8 with the user systemd bus reachable to run the three units and compare counts, or run:
   `systemctl --user start lvb-canvas-sync.service lvb-reader-sync.service lvb-final-plans-sync.service`.

Rollback: Worker, same template, `-- npx -y wrangler@4 rollback <version id>` (the old Worker has no /admin/sync,
so the switched scripts then fail with HTTP 404 until redeployed). Scripts: revert the merge and `apply.sh --undo`;
that brings back wrangler with the broad token, so it only helps while that token still exists.
