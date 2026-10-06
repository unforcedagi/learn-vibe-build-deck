// Class board comments: class-only, own edit/delete, instructor moderation,
// view-as read-only, and XSS strings stay plain text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const { linkSegments } = await import(new URL('../../board/linkify.js', here));
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
  for (const [id, name, instr, tok] of [[1, 'Ana Example', 0, 'ana'], [2, 'Ben Example', 0, 'ben'], [3, 'Aaron Prof', 1, 'prof']]) {
    db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, ?)').run(id, String(id), name, `${id}@example.invalid`, instr);
    db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)')
      .run(createHash('sha256').update(tok).digest('hex'), id, '2099-01-01T00:00:00.000Z');
  }
  return { db, env: { DB: { prepare: (sql) => stmt(sql) }, SITE_ORIGIN: 'https://cu.learnvibe.build' } };
}

const call = (env, tok, method, path, body) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  method,
  headers: { ...(tok ? { Cookie: `lvb_session=${tok}` } : {}), 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env);

async function withPost(env) {
  const { post } = await (await call(env, 'ana', 'POST', '/board', { kind: 'build', title: 'Ana build' })).json();
  return post.id;
}

test('comment create, edit and delete own; shown under the post with first name', async () => {
  const { env } = setup();
  const pid = await withPost(env);
  const res = await call(env, 'ben', 'POST', `/board/${pid}/comments`, { body: 'Nice work!' });
  assert.equal(res.status, 201);
  const { comment } = await res.json();
  assert.equal(comment.author, 'Ben');
  assert.equal(comment.from_instructor, false);
  const list = await (await call(env, 'ana', 'GET', '/board')).json();
  assert.equal(list.posts[0].comments.length, 1);
  assert.equal(list.posts[0].comments[0].body, 'Nice work!');
  assert.equal(list.posts[0].comments[0].mine, false);
  assert.equal((await call(env, 'ben', 'PATCH', `/board/comments/${comment.id}`, { body: 'Edited' })).status, 200);
  assert.equal((await call(env, 'ben', 'DELETE', `/board/comments/${comment.id}`)).status, 200);
  const after = await (await call(env, 'ana', 'GET', '/board')).json();
  assert.equal(after.posts[0].comments.length, 0);
});

test("a student cannot edit or delete another student's comment", async () => {
  const { env } = setup();
  const pid = await withPost(env);
  const { comment } = await (await call(env, 'ben', 'POST', `/board/${pid}/comments`, { body: 'Mine' })).json();
  assert.equal((await call(env, 'ana', 'PATCH', `/board/comments/${comment.id}`, { body: 'Hijack' })).status, 404);
  assert.equal((await call(env, 'ana', 'DELETE', `/board/comments/${comment.id}`)).status, 404);
  const list = await (await call(env, 'ben', 'GET', '/board')).json();
  assert.equal(list.posts[0].comments[0].body, 'Mine');
});

test('instructor can delete any comment and comments carry the From Aaron marker', async () => {
  const { env } = setup();
  const pid = await withPost(env);
  const { comment } = await (await call(env, 'ben', 'POST', `/board/${pid}/comments`, { body: 'Off topic' })).json();
  const prof = await (await call(env, 'prof', 'POST', `/board/${pid}/comments`, { body: 'Great question' })).json();
  assert.equal(prof.comment.from_instructor, true);
  const view = await (await call(env, 'prof', 'GET', '/board')).json();
  assert.ok(view.posts[0].comments.every((c) => c.can_delete));
  assert.equal((await call(env, 'prof', 'PATCH', `/board/comments/${comment.id}`, { body: 'x' })).status, 404, 'moderation is delete, not edit');
  assert.equal((await call(env, 'prof', 'DELETE', `/board/comments/${comment.id}`)).status, 200);
});

test('deleting a post removes its comments', async () => {
  const { db, env } = setup();
  const pid = await withPost(env);
  await call(env, 'ben', 'POST', `/board/${pid}/comments`, { body: 'One' });
  await call(env, 'prof', 'POST', `/board/${pid}/comments`, { body: 'Two' });
  assert.equal((await call(env, 'ana', 'DELETE', `/board/${pid}`)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM board_comments').get().n, 0);
});

test('signed-out comment requests get 401', async () => {
  const { env } = setup();
  const pid = await withPost(env);
  assert.equal((await call(env, null, 'POST', `/board/${pid}/comments`, { body: 'x' })).status, 401);
  assert.equal((await call(env, null, 'PATCH', '/board/comments/1', { body: 'x' })).status, 401);
  assert.equal((await call(env, null, 'DELETE', '/board/comments/1')).status, 401);
});

test('view-as is read-only for comments', async () => {
  const { db, env } = setup();
  const pid = await withPost(env);
  assert.equal((await call(env, 'prof', 'POST', `/board/${pid}/comments?as=1`, { body: 'as Ana' })).status, 403);
  assert.equal((await call(env, 'prof', 'DELETE', '/board/comments/1?as=1')).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM board_comments').get().n, 0);
});

test('validation: empty and over-long comments refused; missing post 404', async () => {
  const { env } = setup();
  const pid = await withPost(env);
  assert.equal((await call(env, 'ben', 'POST', `/board/${pid}/comments`, { body: '   ' })).status, 400);
  assert.equal((await call(env, 'ben', 'POST', `/board/${pid}/comments`, { body: 'x'.repeat(1001) })).status, 400);
  assert.equal((await call(env, 'ben', 'POST', '/board/999/comments', { body: 'hi' })).status, 404);
});

test('XSS strings are stored verbatim and render as text, never markup', async () => {
  const { env } = setup();
  const pid = await withPost(env);
  const evil = '<img src=x onerror=alert(1)> <script>alert(2)</script> javascript:alert(3) see https://example.com/a?b=1.';
  const { comment } = await (await call(env, 'ben', 'POST', `/board/${pid}/comments`, { body: evil })).json();
  assert.equal(comment.body, evil);
  const segs = linkSegments(evil);
  const links = segs.filter((s) => s.href);
  assert.deepEqual(links.map((l) => l.href), ['https://example.com/a?b=1']);
  assert.equal(segs.map((s) => s.text).join(''), evil, 'segments reassemble to the exact original text');
  assert.ok(!links.some((l) => /javascript:/i.test(l.href)));
});
