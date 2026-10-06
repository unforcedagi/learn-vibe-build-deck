// Instructor "view as student": read-only, server-enforced.
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
  for (const [id, name, instr, tok] of [[1, 'Ana Example', 0, 'tok-ana'], [2, 'Ben Example', 0, 'tok-ben'], [3, 'Prof Example', 1, 'tok-prof']]) {
    db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, ?)').run(id, String(id), name, `${id}@example.invalid`, instr);
    db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)')
      .run(createHash('sha256').update(tok).digest('hex'), id, '2099-01-01T00:00:00.000Z');
  }
  db.prepare('INSERT INTO submissions (id, student_id, week, body, submitted_at, link_url) VALUES (10, 1, 1, ?, ?, NULL)').run('ANA week one words', '2026-08-30T12:00:00Z');
  db.prepare('INSERT INTO submissions (id, student_id, week, body, submitted_at, link_url) VALUES (20, 2, 1, ?, ?, NULL)').run('BEN week one words', '2026-08-30T12:00:00Z');
  return { db, env: { DB: { prepare: (sql) => stmt(sql) }, SITE_ORIGIN: 'https://cu.learnvibe.build' } };
}

const call = (env, tok, method, path, body) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  method,
  headers: { ...(tok ? { Cookie: `lvb_session=${tok}` } : {}), 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env);

test('instructor can read any student via ?as, read-only and without the roster', async () => {
  const { env } = setup();
  const res = await call(env, 'tok-prof', 'GET', '/me?as=1');
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.name, 'Ana Example');
  assert.deepEqual(d.submissions.map((s) => s.body), ['ANA week one words']);
  assert.equal(d.read_only, true);
  assert.equal(d.viewing_as.first_name, 'Ana');
  assert.ok(!('roster' in d));
  assert.ok(!JSON.stringify(d).includes('BEN'));
  const list = await (await call(env, 'tok-prof', 'GET', '/instructor/students')).json();
  assert.deepEqual(list.students.map((s) => s.name), ['Ana Example', 'Ben Example']);
});

test('a student passing ?as gets 403, never anyone else\'s (or their own) data', async () => {
  const { env } = setup();
  assert.equal((await call(env, 'tok-ana', 'GET', '/me?as=2')).status, 403);
  assert.equal((await call(env, 'tok-ana', 'GET', '/me?as=1')).status, 403);
  assert.equal((await call(env, 'tok-ana', 'GET', '/instructor/students')).status, 403);
});

test('signed-out requests with ?as get 401', async () => {
  const { env } = setup();
  assert.equal((await call(env, null, 'GET', '/me?as=1')).status, 401);
  assert.equal((await call(env, null, 'GET', '/instructor/students')).status, 401);
});

test('writes carrying ?as are refused, even for the instructor, and change nothing', async () => {
  const { db, env } = setup();
  const writes = [
    ['POST', '/submissions?as=1', { week: 1, body: 'x'.repeat(200), link_url: 'https://example.com' }],
    ['POST', '/submissions/10/share?as=1', { field: 'writing', value: true }],
    ['POST', '/submissions/10/visibility?as=1', { visibility: 'class' }],
    ['POST', '/board?as=1', { kind: 'learning', title: 'Impersonated' }],
    ['PATCH', '/board/1?as=1', { kind: 'learning', title: 'x' }],
    ['DELETE', '/board/1?as=1'],
  ];
  for (const [m, p, b] of writes) {
    const res = await call(env, 'tok-prof', m, p, b);
    assert.equal(res.status, 403, `${m} ${p}`);
  }
  assert.equal(db.prepare('SELECT share_writing FROM submissions WHERE id = 10').get().share_writing, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM board_posts').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM submissions').get().n, 2);
});

test('?as cannot target another instructor or a missing student', async () => {
  const { env } = setup();
  assert.equal((await call(env, 'tok-prof', 'GET', '/me?as=3')).status, 404);
  assert.equal((await call(env, 'tok-prof', 'GET', '/me?as=999')).status, 404);
  assert.equal((await call(env, 'tok-prof', 'GET', '/me?as=abc')).status, 400);
});
