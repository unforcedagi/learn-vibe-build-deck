# Progress: instructor view shows uploaded content (T-121, attempt ap2mra20)

## Done (2026-11-02, MT)
- 11:53 D1 backup ~/Builders/db-backups/lvb/pre-submission-files-20261102-1153.sql. Counts unchanged by the
  migration (students 27, submissions 180, board_posts 18, student_reads 25).
- Migration 0009 (submission_files) applied by hand; private R2 bucket lvb-instructor-files created.
- Before (D1 bodies): 97 uploads; 69 extracted text only, 28 link-only.
- Backfill weeks 2-9: 99 uploads, 99 with content (88 with text), 0 link-only; 199 renderings, all 200 via prod API.
- PR #41 merged 12:03 (9f74c35); Pages built; wrangler deploy version db3c8acc (previous 1b5c612e).
- Prod e2e with throwaway e2e accounts: 20 checks pass; student 403 on the new routes. Cleaned: 0 e2e rows, objects deleted.
- lvb-canvas-sync unit has a third step (resync.py --files); installed, manual run succeeded (99 already done).

## Next
- None. Watch the 06:00 MT run: `journalctl --user -u lvb-canvas-sync.service`.

## Open
- canvas_file_id is unique; if Canvas ever reuses one attachment id across two weeks, the later week keeps
  the row (the sync logs a warning count; none today).
