-- Per-student AI reads for the instructor (one row per student). Additive.
-- Written on uni by worker/student_reads.py (claude -p over that student's own
-- submissions and board posts), served only behind instructor auth by
-- GET /instructor/student. input_hash lets the script skip students whose
-- material hasn't changed.
CREATE TABLE IF NOT EXISTS student_reads (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  body TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  based_on TEXT,          -- JSON: {"weeks":[1,2],"posts":3,"latest":"<iso>"}
  model TEXT,
  generated_at TEXT NOT NULL
);
