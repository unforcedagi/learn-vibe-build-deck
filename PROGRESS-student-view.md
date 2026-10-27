# Progress: instructor student view (T-121, attempt i8lo46fh)

## Done
- 18:16 MT started. Prod D1 has no e2e accounts; migrations applied by hand (d1_migrations empty).
- Migration 0008_student_reads.sql + schema.sql.

## Next
- Worker GET /instructor/student?id= (instructor only, no-store), tests.
- instructor/student/ page; link from roster.
- worker/student_reads.py; systemd units.
- After 19:40 MT: backup D1, migrate, merge, deploy, run reads, enable timer, verify prod.

## Open
