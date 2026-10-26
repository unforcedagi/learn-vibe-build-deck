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
  db.prepare("INSERT INTO pod_sets (id, name, starts_on, ends_on, created_at) VALUES (1, 'Learning pods', '2026-10-12', NULL, 'x')").run();
  db.prepare("INSERT INTO pods (id, pod_set_id, name) VALUES (11, 1, 'Pod Tide')").run();
  db.prepare('INSERT INTO pod_members (pod_id, student_id) VALUES (11, 1), (11, 2)').run();
  const post = db.prepare('INSERT INTO board_posts (id, student_id, kind, title, body, link_url, created_at, updated_at, pod_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  post.run(101, 1, 'build', 'ONE-POST tide demo', 'ONE-POST body: our pod demo.', 'https://one.example/demo', '2026-10-20T18:00:00Z', '2026-10-20T18:00:00Z', null);
  post.run(102, 1, 'question', 'ONE-PODPOST data question', 'ONE-PODPOST body', 'https://one.example/pod-q', '2026-10-21T18:00:00Z', '2026-10-21T18:00:00Z', 11);
  post.run(201, 2, 'build', 'TWO-POST recipe demo', 'TWO-POST body', 'https://two.example/demo', '2026-10-20T19:00:00Z', '2026-10-20T19:00:00Z', null);
  // A classmate's comment on One's post is not One's work.
  db.prepare("INSERT INTO board_comments (post_id, student_id, body, created_at, updated_at) VALUES (101, 2, 'TWO-COMMENT on one''s post', 'x', 'x')").run();
  return { DB: { prepare: (sql) => stmt(sql) }, SITE_ORIGIN: 'https://cu.learnvibe.build' };
}
