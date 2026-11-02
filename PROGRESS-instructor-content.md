# Progress: instructor view shows uploaded content (T-121, attempt ap2mra20)

## Done
- 11:53 MT D1 backup ~/Builders/db-backups/lvb/pre-submission-files-20261102-1153.sql.
  Counts before = after migration: students 27, submissions 180, board_posts 18, student_reads 25.
- Migration 0009 (submission_files) applied to prod by hand; R2 bucket lvb-instructor-files created.
- worker/submission_files.py + resync.py --files; Worker routes /instructor/files and
  /instructor/file/<id>/<part>; instructor/files.js cards on the roster detail and student page.
- Tests: node (84), python (13), local e2e tools/e2e_instructor_files.mjs (21 checks), e2e_student_page, e2e_fp_prompt.
- Before (read-only, D1 bodies): 97 uploads; 69 had extracted text only, 28 were link-only.
- Week 9 backfill: 11 uploads, 11 with content. Full backfill (weeks 2-9): 99 uploads, 99 with content, 0 link-only; 182+17 R2 objects.

## Next
- PR, CI, merge + wrangler deploy (not 4:45-7:45 PM MT), prod e2e with seeded e2e accounts, cleanup.
- Install updated systemd unit (third ExecStart: resync.py --files), git pull the main checkout.
