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
