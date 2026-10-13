// Pod boards: read/write isolation on every board path, class scope never leaks
// pod posts, pod sets change over time and old pods stay readable by members.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const schema = readFileSync(new URL('../schema.sql', here), 'utf8');
const migration = readFileSync(new URL('../migrations/0007_pods.sql', here), 'utf8');

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// ana(1), ben(2) in pod A; cy(3) in pod B; dee(4) in no pod; ex(5) was in an ended pod with ana.
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  const people = [[1, 'Ana Example', 0, 'ana'], [2, 'Ben Example', 0, 'ben'], [3, 'Cy Example', 0, 'cy'],
    [4, 'Dee Example', 0, 'dee'], [5, 'Ex Example', 0, 'ex'], [9, 'Aaron Prof', 1, 'prof']];
  for (const [id, name, instr, tok] of people) {
    db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, ?)').run(id, String(id), name, `${id}@example.invalid`, instr);
    db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)')
      .run(createHash('sha256').update(tok).digest('hex'), id, '2099-01-01T00:00:00.000Z');
  }
  db.prepare("INSERT INTO pod_sets (id, name, starts_on, ends_on, created_at) VALUES (1, 'Old set', ?, ?, 'x')").run(day(-60), day(-30));
  db.prepare("INSERT INTO pod_sets (id, name, starts_on, ends_on, created_at) VALUES (2, 'Current set', ?, ?, 'x')").run(day(-29), day(20));
  db.prepare("INSERT INTO pod_sets (id, name, starts_on, ends_on, created_at) VALUES (3, 'Future set', ?, NULL, 'x')").run(day(21));
  db.prepare("INSERT INTO pods (id, pod_set_id, name) VALUES (10, 1, 'Old pod'), (11, 2, 'Pod A'), (12, 2, 'Pod B'), (13, 3, 'Future pod')").run();
  db.prepare('INSERT INTO pod_members (pod_id, student_id) VALUES (10, 1), (10, 5), (11, 1), (11, 2), (12, 3), (13, 1)').run();
  return { db, env: { DB: { prepare: (sql) => stmt(sql) }, SITE_ORIGIN: 'https://cu.learnvibe.build' } };
}

const call = (env, tok, method, path, body) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  method,
  headers: { ...(tok ? { Cookie: `lvb_session=${tok}` } : {}), 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env);
const jsonOf = (r) => r.json();

async function podPost(env, tok = 'ana', extra = {}) {
  const res = await call(env, tok, 'POST', '/board', { kind: 'build', title: 'Pod thing', pod: true, ...extra });
  assert.equal(res.status, 201);
  return (await res.json()).post;
}

test('migration applies cleanly on top of the pre-pod schema and keeps old rows as class posts', () => {
  const db = new DatabaseSync(':memory:');
  const before = schema.slice(0, schema.indexOf('-- Pod boards')).replace(/,\n  pod_id INTEGER[^\n]*\n/, '\n');
  db.exec(before);
  db.exec("INSERT INTO students (id, canvas_id, name, email) VALUES (1, '1', 'A', 'a@example.invalid')");
  db.exec("INSERT INTO board_posts (student_id, title, created_at, updated_at) VALUES (1, 't', 'x', 'x')");
  db.exec(migration);
  assert.equal(db.prepare('SELECT pod_id FROM board_posts').get().pod_id, null);
});

test('pod post is stored with the current pod and listed only in pod scope', async () => {
  const { env } = setup();
  const post = await podPost(env);
  assert.equal(post.pod_id, 11);
  assert.equal(post.pod_name, 'Pod A');
  await call(env, 'ana', 'POST', '/board', { kind: 'build', title: 'Class thing' });
  const cls = await jsonOf(await call(env, 'ben', 'GET', '/board'));
  assert.deepEqual(cls.posts.map((p) => p.title), ['Class thing']);
  const clsExplicit = await jsonOf(await call(env, 'ben', 'GET', '/board?scope=class'));
  assert.deepEqual(clsExplicit.posts.map((p) => p.title), ['Class thing']);
  const pod = await jsonOf(await call(env, 'ben', 'GET', '/board?scope=pod'));
  assert.deepEqual(pod.posts.map((p) => p.title), ['Pod thing']);
  assert.equal(pod.pod.name, 'Pod A');
});

test('class scope never returns pod posts or their comments, even for the instructor', async () => {
  const { env } = setup();
  const post = await podPost(env);
  await call(env, 'ben', 'POST', `/board/${post.id}/comments`, { body: 'pod secret' });
  for (const tok of ['ana', 'cy', 'dee', 'prof']) {
    const cls = await jsonOf(await call(env, tok, 'GET', '/board'));
    assert.equal(cls.posts.length, 0, tok);
    assert.ok(!JSON.stringify(cls).includes('pod secret'), tok);
  }
});

test('non-member cannot read a pod board, nor a past pod they were not in', async () => {
  const { env } = setup();
  await podPost(env);
  assert.equal((await call(env, 'cy', 'GET', '/board?scope=pod&pod_id=11')).status, 403);
  assert.equal((await call(env, 'dee', 'GET', '/board?scope=pod&pod_id=11')).status, 403);
  assert.equal((await call(env, 'dee', 'GET', '/board?scope=pod')).status, 404, 'no pod');
  assert.equal((await call(env, 'cy', 'GET', '/board?scope=pod&pod_id=10')).status, 403);
  assert.equal((await call(env, 'cy', 'GET', '/board?scope=bogus')).status, 400);
  assert.equal((await call(env, null, 'GET', '/board?scope=pod')).status, 401);
});

test('non-member cannot comment, edit or delete on a pod post (404, nothing changes)', async () => {
  const { env, db } = setup();
  const post = await podPost(env);
  const { comment } = await jsonOf(await call(env, 'ben', 'POST', `/board/${post.id}/comments`, { body: 'hi' }));
  for (const tok of ['cy', 'dee']) {
    assert.equal((await call(env, tok, 'POST', `/board/${post.id}/comments`, { body: 'x' })).status, 404);
    assert.equal((await call(env, tok, 'PATCH', `/board/${post.id}`, { title: 'hijack' })).status, 404);
    assert.equal((await call(env, tok, 'DELETE', `/board/${post.id}`)).status, 404);
    assert.equal((await call(env, tok, 'PATCH', `/board/comments/${comment.id}`, { body: 'x' })).status, 404);
    assert.equal((await call(env, tok, 'DELETE', `/board/comments/${comment.id}`)).status, 404);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM board_comments').get().n, 1);
  assert.equal(db.prepare('SELECT title FROM board_posts WHERE id = ?').get(post.id).title, 'Pod thing');
});

test('a former member loses write access to a pod post once removed, but keeps reading history of ended pods', async () => {
  const { env, db } = setup();
  const post = await podPost(env);
  db.prepare('DELETE FROM pod_members WHERE pod_id = 11 AND student_id = 1').run();
  assert.equal((await call(env, 'ana', 'PATCH', `/board/${post.id}`, { kind: 'build', title: 'late' })).status, 404);
  assert.equal((await call(env, 'ana', 'DELETE', `/board/${post.id}`)).status, 404);
  // ended pod: member can read it by id
  db.prepare("INSERT INTO board_posts (student_id, title, created_at, updated_at, pod_id) VALUES (5, 'history', 'x', 'x', 10)").run();
  const hist = await jsonOf(await call(env, 'ana', 'GET', '/board?scope=pod&pod_id=10'));
  assert.deepEqual(hist.posts.map((p) => p.title), ['history']);
});

test('members can comment, edit and delete their own in the pod; comments inherit visibility', async () => {
  const { env } = setup();
  const post = await podPost(env);
  const res = await call(env, 'ben', 'POST', `/board/${post.id}/comments`, { body: 'yes' });
  assert.equal(res.status, 201);
  const { comment } = await jsonOf(res);
  assert.equal((await call(env, 'ben', 'PATCH', `/board/comments/${comment.id}`, { body: 'edited' })).status, 200);
  const pod = await jsonOf(await call(env, 'ana', 'GET', '/board?scope=pod'));
  assert.equal(pod.posts[0].comments[0].body, 'edited');
  assert.equal((await call(env, 'ana', 'PATCH', `/board/${post.id}`, { kind: 'build', title: 'Renamed' })).status, 200);
  assert.equal((await call(env, 'ben', 'DELETE', `/board/comments/${comment.id}`)).status, 200);
  assert.equal((await call(env, 'ana', 'DELETE', `/board/${post.id}`)).status, 200);
});

test('POST pod:true is refused outside a pod; a future or ended set does not count; students cannot pass pod_id', async () => {
  const { env } = setup();
  const res = await call(env, 'dee', 'POST', '/board', { title: 'x', pod: true });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'no_pod');
  // student 5 is only in an ended pod
  assert.equal((await call(env, 'ex', 'POST', '/board', { title: 'x', pod: true })).status, 400);
  // pod_id from a student is ignored: the post lands in the class board
  const { post } = await jsonOf(await call(env, 'cy', 'POST', '/board', { title: 'sneaky', pod_id: 11 }));
  assert.equal(post.pod_id, null);
});

test('instructor can read, post to and comment in any pod; pod_id must exist', async () => {
  const { env } = setup();
  const post = await podPost(env);
  const list = await jsonOf(await call(env, 'prof', 'GET', '/board?scope=pod&pod_id=11'));
  assert.equal(list.posts.length, 1);
  assert.equal((await call(env, 'prof', 'GET', '/board?scope=pod')).status, 400);
  assert.equal((await call(env, 'prof', 'POST', `/board/${post.id}/comments`, { body: 'hello pod' })).status, 201);
  const ip = await call(env, 'prof', 'POST', '/board', { title: 'to pod B', pod_id: 12 });
  assert.equal((await ip.json()).post.pod_id, 12);
  assert.equal((await call(env, 'prof', 'POST', '/board', { title: 'x', pod_id: 999 })).status, 400);
  assert.equal((await call(env, 'cy', 'GET', '/board?scope=pod')).status, 200);
  const b = await jsonOf(await call(env, 'cy', 'GET', '/board?scope=pod'));
  assert.deepEqual(b.posts.map((p) => p.title), ['to pod B']);
});

test('instructor can moderate (delete) comments on pod posts', async () => {
  const { env } = setup();
  const post = await podPost(env);
  const { comment } = await jsonOf(await call(env, 'ben', 'POST', `/board/${post.id}/comments`, { body: 'x' }));
  assert.equal((await call(env, 'prof', 'DELETE', `/board/comments/${comment.id}`)).status, 200);
});

test('/me/pod: current pod with first names, past pods, instructor sees all current pods', async () => {
  const { env } = setup();
  const me = await jsonOf(await call(env, 'ana', 'GET', '/me/pod'));
  assert.equal(me.current.name, 'Pod A');
  assert.equal(me.current.set_name, 'Current set');
  assert.deepEqual(me.current.members, ['Ana', 'Ben']);
  assert.deepEqual(me.past.map((p) => p.name), ['Old pod']);
  assert.ok(!JSON.stringify(me).includes('example.invalid'));
  const none = await jsonOf(await call(env, 'dee', 'GET', '/me/pod'));
  assert.equal(none.current, null);
  const prof = await jsonOf(await call(env, 'prof', 'GET', '/me/pod'));
  assert.deepEqual(prof.pods.map((p) => p.name), ['Pod A', 'Pod B']);
  assert.equal((await call(env, null, 'GET', '/me/pod')).status, 401);
});

test('pod set rollover: when the current set ends, the next set becomes current and old posts stay readable', async () => {
  const { env, db } = setup();
  const post = await podPost(env);
  db.prepare('UPDATE pod_sets SET ends_on = ? WHERE id = 2').run(day(-1));
  db.prepare('UPDATE pod_sets SET starts_on = ? WHERE id = 3').run(day(0));
  const me = await jsonOf(await call(env, 'ana', 'GET', '/me/pod'));
  assert.equal(me.current.name, 'Future pod');
  assert.deepEqual(me.past.map((p) => p.name).sort(), ['Old pod', 'Pod A']);
  const hist = await jsonOf(await call(env, 'ben', 'GET', `/board?scope=pod&pod_id=${post.pod_id}`));
  assert.equal(hist.posts.length, 1);
  // ben has no pod in the new set
  assert.equal((await call(env, 'ben', 'GET', '/board?scope=pod')).status, 404);
});

test('view-as writes are still refused for pod posts', async () => {
  const { env } = setup();
  const res = await call(env, 'prof', 'POST', '/board?as=1', { title: 'x', pod: true });
  assert.equal(res.status, 403);
});
