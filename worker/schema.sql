-- Learn, Vibe, Build — student accounts schema (D1 / SQLite).
-- All timestamps are ISO-8601 UTC strings written by the Worker
-- (never SQLite datetime('now'), so string comparison stays consistent).

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  canvas_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_instructor INTEGER NOT NULL DEFAULT 0,
  -- Optional alternate sign-in address (e.g. an identikey@colorado.edu),
  -- for anyone whose Canvas email differs from what they actually check.
  -- `email` stays whatever Canvas reports, so the resync's upsert (keyed
  -- on email) never collides with or duplicates this row.
  login_alias TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_login_alias
  ON students(login_alias) WHERE login_alias IS NOT NULL;

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  week INTEGER NOT NULL,
  body TEXT,
  submitted_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','class')),
  -- Site-native submissions (week 2 on) carry a build link plus two
  -- independent share flags. Canvas-synced rows (week 1) leave link_url NULL
  -- and share_build 0; their `visibility` was backfilled into share_writing
  -- at migration time so the UI can read one set of fields either way.
  link_url TEXT,
  share_build INTEGER NOT NULL DEFAULT 0,
  share_writing INTEGER NOT NULL DEFAULT 0
);

-- One submission per student per week; makes seeding idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_student_week
  ON submissions(student_id, week);

-- Instructor "reads" — weekly synthesis notes written by Uni for Aaron.
-- audience 'instructor' is private to the instructor view; 'class' marks a
-- read as safe to show/read aloud in class (still only served to sessions).
CREATE TABLE IF NOT EXISTS reads (
  id INTEGER PRIMARY KEY,
  week INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT,
  body TEXT,
  audience TEXT NOT NULL DEFAULT 'instructor' CHECK (audience IN ('instructor','class')),
  updated_at TEXT,
  UNIQUE(week, slug)
);

CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_tokens_email ON magic_tokens(email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  expires_at TEXT NOT NULL
);
