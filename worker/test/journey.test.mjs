// My journey reads /me. Guard that /me only ever returns the signed-in
// student's own submissions, and refuses signed-out requests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const schema = readFileSync(new URL('../schema.sql', here), 'utf8');

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  const students = [[1, 'Ana Example', 'tok-ana'], [2, 'Ben Example', 'tok-ben']];
  for (const [id, name, tok] of students) {
    db.prepare('INSERT INTO students (id, canvas_id, name, email) VALUES (?, ?, ?, ?)').run(id, String(id), name, `${id}@example.invalid`);
    db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)')
      .run(createHash('sha256').update(tok).digest('hex'), id, '2099-01-01T00:00:00.000Z');
  }
  const sub = db.prepare('INSERT INTO submissions (student_id, week, body, submitted_at, link_url) VALUES (?, ?, ?, ?, ?)');
  sub.run(1, 1, 'ANA week one intentions', '2026-08-30T12:00:00Z', null);
  sub.run(1, 4, 'ANA week four build notes', '2026-10-01T12:00:00Z', 'https://ana.example/build');
  sub.run(2, 1, 'BEN week one private words', '2026-08-30T12:00:00Z', null);
  sub.run(2, 5, 'BEN week five private words', '2026-10-02T12:00:00Z', 'https://ben.example/build');
  return { DB: { prepare: (sql) => stmt(sql) }, SITE_ORIGIN: 'https://cu.learnvibe.build' };
}

const me = (env, tok) => worker.fetch(new Request('https://api.learnvibe.build/me', {
  headers: tok ? { Cookie: `lvb_session=${tok}` } : {},
}), env);

test('journey data: each student sees only their own submissions', async () => {
  const env = setup();
  const ana = await (await me(env, 'tok-ana')).json();
  assert.deepEqual(ana.submissions.map((s) => s.week), [1, 4]);
  const anaText = JSON.stringify(ana);
  assert.ok(!anaText.includes('BEN'), "Ana's payload must not contain Ben's writing");
  assert.ok(!anaText.includes('ben.example'), "Ana's payload must not contain Ben's link");
  assert.ok(!('roster' in ana), 'students never get the roster');

  const ben = await (await me(env, 'tok-ben')).json();
  assert.deepEqual(ben.submissions.map((s) => s.week), [1, 5]);
  assert.ok(!JSON.stringify(ben).includes('ANA'));
});

test('journey data: weeks carry title, prompt and due date for every week', async () => {
  const env = setup();
  const ana = await (await me(env, 'tok-ana')).json();
  for (const w of ana.weeks) {
    assert.ok(w.title && w.prompt && w.due_at, `week ${w.week} incomplete`);
  }
  assert.ok(Number.isInteger(ana.open_week));
});

test('journey data: signed-out and bad-token requests get 401', async () => {
  const env = setup();
  assert.equal((await me(env, null)).status, 401);
  assert.equal((await me(env, 'not-a-real-token')).status, 401);
});
