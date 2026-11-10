// Fixture class for the final project prompt: two throwaway e2e accounts, an
// empty account and an instructor. Invented text only, never real student data.
// Shared by worker/test/fp-prompt.test.mjs and tools/e2e_fp_prompt.mjs.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8');

export const TOKENS = { one: 'tok-e2e-one', two: 'tok-e2e-two', empty: 'tok-e2e-empty', prof: 'tok-e2e-prof' };

export function fixtureEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    runSync: () => db.prepare(sql).run(...args),
  });
  const people = [
    [1, 'E2E One', 'e2e-test@learnvibe.build', 0, TOKENS.one],
    [2, 'E2E Two', 'e2e-test-2@learnvibe.build', 0, TOKENS.two],
    [3, 'E2E Empty', 'e2e-test-3@learnvibe.build', 0, TOKENS.empty],
    [9, 'E2E Prof', 'e2e-prof@learnvibe.build', 1, TOKENS.prof],
  ];
  for (const [id, name, email, instr, tok] of people) {
    db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, ?)').run(id, String(id), name, email, instr);
    db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)')
      .run(createHash('sha256').update(tok).digest('hex'), id, '2099-01-01T00:00:00.000Z');
  }
  const sub = db.prepare('INSERT INTO submissions (student_id, week, body, submitted_at, link_url) VALUES (?, ?, ?, ?, ?)');
  // Week 1 is Canvas-synced in production: no link_url, links live in the text.
  sub.run(1, 1, 'ONE-W1 intentions: I want to make a tide chart for surfers. Sketch at https://one.example/sketch.', '2026-08-30T12:00:00Z', null);
  sub.run(1, 4, 'ONE-W4 build notes: the tide chart now reads live data.', '2026-10-01T12:00:00Z', 'https://one.example/tides');
  sub.run(1, 6, 'ONE-W6 reflection: I learned to ask the AI for smaller steps.', '2026-10-11T12:00:00Z', null);
  sub.run(2, 2, 'TWO-W2 private words about a recipe app.', '2026-09-13T12:00:00Z', 'https://two.example/recipes');
  sub.run(2, 3, 'TWO-W3 late: tried three tools for the recipe app.\n\n---\n\n**Uploaded: [notes.pdf](https://two.example/notes.pdf)**\n\nTWO-ATTACHMENT extracted text.', '2026-09-25T12:00:00Z', null);
  db.prepare("INSERT INTO pod_sets (id, name, starts_on, ends_on, created_at) VALUES (1, 'Learning pods', '2026-10-12', NULL, 'x')").run();
  db.prepare("INSERT INTO pods (id, pod_set_id, name) VALUES (11, 1, 'Pod Tide')").run();
  db.prepare('INSERT INTO pod_members (pod_id, student_id) VALUES (11, 1), (11, 2)').run();
  const post = db.prepare('INSERT INTO board_posts (id, student_id, kind, title, body, link_url, created_at, updated_at, pod_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  post.run(101, 1, 'build', 'ONE-POST tide demo', 'ONE-POST body: our pod demo.', 'https://one.example/demo', '2026-10-20T18:00:00Z', '2026-10-20T18:00:00Z', null);
  post.run(102, 1, 'question', 'ONE-PODPOST data question', 'ONE-PODPOST body', 'https://one.example/pod-q', '2026-10-21T18:00:00Z', '2026-10-21T18:00:00Z', 11);
  post.run(201, 2, 'build', 'TWO-POST recipe demo', 'TWO-POST body', 'https://two.example/demo', '2026-10-20T19:00:00Z', '2026-10-20T19:00:00Z', null);
  // A classmate's comment on One's post is not One's work.
  db.prepare("INSERT INTO board_comments (post_id, student_id, body, created_at, updated_at) VALUES (101, 2, 'TWO-COMMENT on one''s post', 'x', 'x')").run();
  // AI reads (instructor-only, /instructor/student). E2E Empty has none.
  const read = db.prepare('INSERT INTO student_reads (student_id, body, input_hash, based_on, model, generated_at) VALUES (?, ?, ?, ?, ?, ?)');
  read.run(1, '## Where they are\nONE-READ: steady builder of a tide chart (Week 4).', 'h1', '{"weeks":[1,4,6],"posts":2,"latest":"2026-10-21T18:00:00Z"}', 'opus', '2026-10-26T12:00:00Z');
  read.run(2, '## Where they are\nTWO-READ: one recipe app submission (Week 2).', 'h2', '{"weeks":[2],"posts":1,"latest":"2026-10-20T19:00:00Z"}', 'opus', '2026-10-26T12:00:00Z');
  // Uploaded files (instructor-only, 0009): One's week 4 has an HTML page and a
  // Word doc, Two's week 3 a PDF. Renderings live in the fake FILES bucket.
  const file = db.prepare(`INSERT INTO submission_files (id, student_id, week, canvas_file_id, position, name,
    content_type, size, kind, text, pages, rendition, rendition_type, canvas_url, status, render_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', 1, '2026-11-02T00:00:00Z')`);
  file.run(31, 1, 4, 'cf-one-html', 0, 'tide-planner.html', 'text/html', 686, 'html', 'ONE-FILE html text: Tide planner', 0, 'html', 'text/html', 'https://canvas.example/files/31');
  file.run(32, 1, 4, 'cf-one-docx', 1, 'final-plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 5366, 'office', 'ONE-FILE docx text: Final project plan', 1, null, null, 'https://canvas.example/files/32');
  file.run(33, 2, 3, 'cf-two-pdf', 0, 'notes.pdf', 'application/pdf', 22852, 'pdf', 'TWO-FILE pdf text', 2, null, null, 'https://canvas.example/files/33');
  const objects = new Map([
    ['files/cf-one-html/rendition', '<!DOCTYPE html><p>ONE-FILE html page</p><script>parent.document.title="ESCAPED"</script>'],
    ['files/cf-one-docx/p1.jpg', 'ONE-FILE-JPEG'],
    ['files/cf-two-pdf/p1.jpg', 'TWO-FILE-JPEG-1'],
    ['files/cf-two-pdf/p2.jpg', 'TWO-FILE-JPEG-2'],
  ]);
  const FILES = {
    objects,
    async get(key, opts) {
      if (!objects.has(key)) return null;
      const v = objects.get(key);
      const bytes = typeof v === 'string' ? new TextEncoder().encode(v) : v;
      const r = opts?.range;
      let start = 0, len = bytes.length;
      if (r) {
        if (r.suffix !== undefined) { start = bytes.length - r.suffix; len = r.suffix; }
        else { start = r.offset; len = r.length ?? bytes.length - r.offset; }
      }
      return { size: bytes.length, range: r, httpMetadata: {}, body: bytes.slice(start, start + len) };
    },
  };
  // batch(): D1 runs the statements as one transaction.
  const batch = async (list) => {
    db.exec('BEGIN');
    try { const out = list.map((st) => ({ meta: { changes: st.runSync().changes } })); db.exec('COMMIT'); return out; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  };
  return { DB: { prepare: (sql) => stmt(sql), batch, db }, FILES, SITE_ORIGIN: 'https://cu.learnvibe.build',
    DEMO_PREVIEW: 'e2e-test@learnvibe.build,e2e-test-2@learnvibe.build' };
}
