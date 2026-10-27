# Progress: instructor student view (T-121, attempt i8lo46fh)

## Done
- 18:16 MT started. Prod D1 has no e2e accounts; migrations applied by hand (d1_migrations empty).
- Migration 0008_student_reads.sql + schema.sql.
- GET /instructor/student?id= + node tests (red when the 403 check or read scoping is broken).
- instructor/student/ page, roster link, tools/e2e_student_page.mjs, WALKTHROUGH.md + screenshots (fixture accounts).
- worker/student_reads.py + python unit tests (red when per-student filtering is broken); one real claude -p call on invented material: opus-5-5, $0.025.
- worker/systemd/lvb-canvas-sync.{service,timer}; tools/README.md section.
- /code-review: fixed upsert failure handling (no SQL in logs, batched), deadline cutoff, timestamp parsing, strip without due date, unit network wait.

- 19:40 MT: D1 backup ~/Builders/db-backups/lvb/pre-student-reads-20261026-1940.sql; row counts before = after for every existing table (submissions later 162 -> 163 from the scheduled resync). 0008 applied.
- Merged #34, wrangler deploy (version 5bb912ba). First prod run found wrangler --file returns no rows; fixed reads to use --command (#35, merged).
- student_reads.py for all students: 25 generated, 0 failed, $1.61. SQL: 25 reads, 0 students with submissions lacking one.
- lvb-canvas-sync.timer installed and enabled. Manual start 1: success (resync + 1 regenerated, $0.07). Manual start 2: 25 skipped, 0 to generate.
- Prod: e2e instructor session -> 200 no-store with read; e2e student -> 403 (also for own id); signed out -> 401. Temporary e2e rows and sessions removed.

## Next
- None. Watch the first 06:00 MT timer run in `journalctl --user -u lvb-canvas-sync.service`.

## Open
- The Monday noon run will regenerate most students (new work or a newly missing week both count as a change); about $0.07 per student.
