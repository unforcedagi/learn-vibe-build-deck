-- Final demo sign-up (0011). Additive: two new tables, nothing else changes.
-- demo_slots: one row per taken slot. Days are the semester.json meetings
-- marked "demo_signup" (DEMO_DAYS in weeks.generated.js); positions run 1..13.
-- A student row has student_id; a guest or auditor the instructor added has
-- guest_name instead. One slot per student and one entry per slot are enforced
-- here by unique indexes, so two people racing for a slot can't both win.
CREATE TABLE IF NOT EXISTS demo_slots (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,                              -- YYYY-MM-DD
  position INTEGER NOT NULL,                      -- 1..13; negative only mid-swap
  student_id INTEGER REFERENCES students(id),     -- NULL for a guest
  guest_name TEXT,                                -- set only for a guest
  title TEXT NOT NULL,                            -- the one-line project title
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((student_id IS NULL) <> (guest_name IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_slots_day_position ON demo_slots(day, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_slots_student ON demo_slots(student_id) WHERE student_id IS NOT NULL;

-- One row (id = 1), written by the instructor view. signup_open = 0 keeps the
-- sign-up unlinked and closed to students; lock_at (ISO UTC) ends student
-- changes. No row reads as closed with no lock.
CREATE TABLE IF NOT EXISTS demo_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  signup_open INTEGER NOT NULL DEFAULT 0,
  lock_at TEXT,
  updated_at TEXT NOT NULL
);
