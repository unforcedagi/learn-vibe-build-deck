-- Pod boards: posts can be shared to a pod instead of the whole class.
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

-- NULL = whole class (every existing row).
ALTER TABLE board_posts ADD COLUMN pod_id INTEGER REFERENCES pods(id);
CREATE INDEX IF NOT EXISTS idx_board_posts_pod ON board_posts(pod_id, created_at);
