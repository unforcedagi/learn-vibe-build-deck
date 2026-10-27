# Progress: instructor student view (T-121, attempt i8lo46fh)

## Done
- 18:16 MT started. Prod D1 has no e2e accounts; migrations applied by hand (d1_migrations empty).
- Migration 0008_student_reads.sql + schema.sql.
- GET /instructor/student?id= + node tests (red when the 403 check or read scoping is broken).
- instructor/student/ page, roster link, tools/e2e_student_page.mjs, WALKTHROUGH.md + screenshots (fixture accounts).
- worker/student_reads.py + python unit tests (red when per-student filtering is broken); one real claude -p call on invented material: opus-5-5, $0.025.
- worker/systemd/lvb-canvas-sync.{service,timer}; tools/README.md section.
- /code-review: fixed upsert failure handling (no SQL in logs, batched), deadline cutoff, timestamp parsing, strip without due date, unit network wait.

## Next
- Open PR (branch push only).
- After 19:40 MT: backup D1, migrate, merge, deploy, run reads, enable timer, verify prod.

## Open
