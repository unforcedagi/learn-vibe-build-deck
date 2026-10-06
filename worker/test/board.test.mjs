// Class board: signed-in classmates only; authors edit/delete their own.
// Runs the real Worker fetch handler against in-memory SQLite shaped like D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const schema = readFileSync(new URL('../schema.sql', here), 'utf8');

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { db, prepare: (sql) => stmt(sql) };
}

const tokens = { ana: 'tok-ana', ben: 'tok-ben', aaron: 'tok-aaron' };
function setup() {
  const DB = fakeD1();
  const add = (id, name, email, instr, tok) => {
    DB.db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, ?)')
      .run(id, String(id), name, email, instr);
    DB.db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)')
      .run(createHash('sha256').update(tok).digest('hex'), id, '2099-01-01T00:00:00.000Z');
  };
  add(1, 'Ana Example', 'ana@example.invalid', 0, tokens.ana);
  add(2, 'Ben Example', 'ben@example.invalid', 0, tokens.ben);
  add(3, 'Aaron Instructor', 'aaron@example.invalid', 1, tokens.aaron);
  return { DB, SITE_ORIGIN: 'https://cu.learnvibe.build' };
}

const call = (env, who, method, path, body) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  method,
  headers: { ...(who ? { Cookie: `lvb_session=${tokens[who]}` } : {}), 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env);

const post = { kind: 'build', title: 'My flashcard app', body: 'Quizzes me on markdown.', link_url: 'https://example.com/cards' };

test('signed-out requests get 401 for every board route', async () => {
  const env = setup();
  for (const [m, p, b] of [['GET', '/board'], ['POST', '/board', post], ['PATCH', '/board/1', post], ['DELETE', '/board/1']]) {
    const res = await call(env, null, m, p, b);
    assert.equal(res.status, 401, `${m} ${p}`);
  }
});

test('a student creates a post and classmates see it with first name only', async () => {
  const env = setup();
  const res = await call(env, 'ana', 'POST', '/board', post);
  assert.equal(res.status, 201);
  const { post: created } = await res.json();
  assert.equal(created.author, 'Ana');
  assert.equal(created.pinned, false);
  const list = await (await call(env, 'ben', 'GET', '/board')).json();
  assert.equal(list.posts.length, 1);
  assert.equal(list.posts[0].title, 'My flashcard app');
  assert.equal(list.posts[0].author, 'Ana');
  assert.equal(list.posts[0].mine, false);
  assert.ok(!('email' in list.posts[0]));
});

test('author edits and deletes their own post', async () => {
  const env = setup();
  const { post: p } = await (await call(env, 'ana', 'POST', '/board', post)).json();
  const edit = await call(env, 'ana', 'PATCH', `/board/${p.id}`, { ...post, title: 'Renamed', kind: 'learning' });
  assert.equal(edit.status, 200);
  assert.equal((await edit.json()).post.title, 'Renamed');
  const del = await call(env, 'ana', 'DELETE', `/board/${p.id}`);
  assert.equal(del.status, 200);
  const list = await (await call(env, 'ana', 'GET', '/board')).json();
  assert.equal(list.posts.length, 0);
});

test("a student cannot edit or delete another student's post", async () => {
  const env = setup();
  const { post: p } = await (await call(env, 'ana', 'POST', '/board', post)).json();
  assert.equal((await call(env, 'ben', 'PATCH', `/board/${p.id}`, { ...post, title: 'Hijacked' })).status, 404);
  assert.equal((await call(env, 'ben', 'DELETE', `/board/${p.id}`)).status, 404);
  const list = await (await call(env, 'ana', 'GET', '/board')).json();
  assert.equal(list.posts[0].title, 'My flashcard app');
});

test('instructor posts are pinned first and marked from the instructor', async () => {
  const env = setup();
  await call(env, 'ana', 'POST', '/board', post);
  await call(env, 'aaron', 'POST', '/board', { kind: 'resource', title: 'OpenAI Academy', link_url: 'https://academy.openai.com/' });
  const list = await (await call(env, 'ben', 'GET', '/board')).json();
  assert.equal(list.posts[0].title, 'OpenAI Academy');
  assert.equal(list.posts[0].pinned, true);
  assert.equal(list.posts[0].from_instructor, true);
});

test('validation: title required, links must be http(s), kind from the list', async () => {
  const env = setup();
  assert.equal((await call(env, 'ana', 'POST', '/board', { ...post, title: '  ' })).status, 400);
  assert.equal((await call(env, 'ana', 'POST', '/board', { ...post, link_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call(env, 'ana', 'POST', '/board', { ...post, kind: 'spam' })).status, 400);
  assert.equal((await call(env, 'ana', 'POST', '/board', { ...post, link_url: '' })).status, 201);
});
