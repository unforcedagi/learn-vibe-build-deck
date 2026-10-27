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

-- Class board: posts shared with signed-in classmates (never public).
-- Additive table; authors edit/delete their own. Instructor posts pin.
CREATE TABLE IF NOT EXISTS board_posts (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL DEFAULT 'learning' CHECK (kind IN ('build','resource','question','learning')),
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pod_id INTEGER REFERENCES pods(id)  -- NULL = whole class (0007_pods.sql)
);

CREATE INDEX IF NOT EXISTS idx_board_posts_created ON board_posts(pinned, created_at);

-- Class board comments: signed-in class only. Additive table.
-- Authors edit/delete their own; the instructor can delete any (moderation).
-- Deleting a post deletes its comments (done in the Worker, same handler).
CREATE TABLE IF NOT EXISTS board_comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES board_posts(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_comments_post ON board_comments(post_id, created_at);

-- Pod boards (0007; board_posts.pod_id is declared above): posts can be shared to a pod instead of the whole class.
-- Additive. Pod *sets* change over time (e.g. Weeks 7-9 learning pods, then
-- final-project pods); old pods and their posts stay readable as history.
CREATE TABLE IF NOT EXISTS pod_sets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,          -- YYYY-MM-DD
  ends_on TEXT,                     -- YYYY-MM-DD, inclusive; NULL = open-ended
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pods (
  id INTEGER PRIMARY KEY,
  pod_set_id INTEGER NOT NULL REFERENCES pod_sets(id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pod_members (
  pod_id INTEGER NOT NULL REFERENCES pods(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  PRIMARY KEY (pod_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_pod_members_student ON pod_members(student_id);

CREATE INDEX IF NOT EXISTS idx_board_posts_pod ON board_posts(pod_id, created_at);

-- Per-student AI reads for the instructor (0008). Additive.
-- Written on uni by worker/student_reads.py, served only to the instructor.
CREATE TABLE IF NOT EXISTS student_reads (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  body TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  based_on TEXT,          -- JSON: {"weeks":[1,2],"posts":3,"latest":"<iso>"}
  model TEXT,
  generated_at TEXT NOT NULL
);
