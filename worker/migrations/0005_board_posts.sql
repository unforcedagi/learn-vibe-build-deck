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
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_posts_created ON board_posts(pinned, created_at);
