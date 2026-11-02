-- What students uploaded to Canvas, readable in the instructor view (0009). Additive.
-- Written on uni by worker/resync.py (worker/submission_files.py): extracted
-- text here, renderings (PDF/office page images, the HTML file, images,
-- video) in the private R2 bucket lvb-instructor-files under
-- files/<canvas_file_id>/. Served only to the instructor; the student-facing
-- endpoints never read this table.
CREATE TABLE IF NOT EXISTS submission_files (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  week INTEGER NOT NULL,
  canvas_file_id TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,  -- order within the submission
  name TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  kind TEXT NOT NULL,                   -- pdf, office, html, image, text, video, archive, other
  text TEXT,                            -- extracted text (capped)
  pages INTEGER NOT NULL DEFAULT 0,     -- page images in R2: p1.jpg .. p<pages>.jpg
  rendition TEXT,                       -- html | image | video: the file itself in R2
  rendition_type TEXT,                  -- its MIME type
  canvas_url TEXT,                      -- the original on Canvas (secondary link)
  status TEXT,                          -- ok, or why there is no content
  render_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submission_files_student_week
  ON submission_files(student_id, week, position);
