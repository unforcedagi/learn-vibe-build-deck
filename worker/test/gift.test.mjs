// Gift videos: each student's one-minute film. Only that student (or an instructor) may fetch it,
// a classmate gets 403 whether or not one exists, and nobody without one sees an empty box.
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

const BYTES = new TextEncoder().encode('0123456789abcdefghij');
function fakeR2(keys) {
  const sliceOf = (r) => {
    if (!r) return [0, BYTES.length];
    if (r.suffix !== undefined) return [BYTES.length - r.suffix, r.suffix];
    return [r.offset, r.length ?? BYTES.length - r.offset];
  };
  return {
    gets: [],
    async get(key, opts) {
      this.gets.push(key);
      if (!keys.includes(key)) return null;
      const [start, len] = sliceOf(opts?.range);
      return { size: BYTES.length, range: opts?.range, body: BYTES.slice(start, start + len) };
    },
    async head(key) { return keys.includes(key) ? { size: BYTES.length } : null; },
    async list({ prefix }) {
      return { objects: keys.filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
  };
}

const tok = (t) => createHash('sha256').update(t).digest('hex');
function setup() {
  const DB = fakeD1();
  const add = DB.db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, ?)');
  add.run(1, '101', 'Ana Example', 'ana@example.invalid', 0);
  add.run(2, '102', 'Bo Example', 'bo@example.invalid', 0);
  add.run(3, null, 'Teacher Example', 'teach@example.invalid', 1);
  const ses = DB.db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)');
  for (const [t, id] of [['tok-ana', 1], ['tok-bo', 2], ['tok-teach', 3]]) ses.run(tok(t), id, '2099-01-01T00:00:00.000Z');
  // Ana has a video; Bo doesn't.
  return { DB, GIFTS: fakeR2(['gift/1.mp4']), SITE_ORIGIN: 'https://cu.learnvibe.build' };
}

const get = (env, token, path, headers = {}) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  headers: { ...(token ? { Cookie: `lvb_session=${token}` } : {}), ...headers },
}), env);

test('the owner gets their own video, whole and by range', async () => {
  const env = setup();
  const res = await get(env, 'tok-ana', '/gift/1');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'video/mp4');
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(await res.text(), '0123456789abcdefghij');
  const part = await get(env, 'tok-ana', '/gift/1', { Range: 'bytes=2-5' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), 'bytes 2-5/20');
  assert.equal(await part.text(), '2345');
});

test('signed out gets 401 and never touches the bucket', async () => {
  const env = setup();
  assert.equal((await get(env, null, '/gift/1')).status, 401);
  assert.deepEqual(env.GIFTS.gets, []);
});

test("a classmate gets 403 for someone else's video, before the bucket is read", async () => {
  const env = setup();
  const res = await get(env, 'tok-bo', '/gift/1');
  assert.equal(res.status, 403);
  assert.deepEqual(env.GIFTS.gets, []);
  // Same answer for an id with no video, so 403 vs 404 leaks nothing.
  assert.equal((await get(env, 'tok-ana', '/gift/2')).status, 403);
  // A stale or forged session is just signed out.
  assert.equal((await get(env, 'tok-nobody', '/gift/1')).status, 401);
});

test('an instructor can watch any student’s video', async () => {
  const env = setup();
  assert.equal((await get(env, 'tok-teach', '/gift/1')).status, 200);
  assert.equal((await get(env, 'tok-teach', '/gift/2')).status, 404);
});

test('path tricks never reach another key', async () => {
  const env = setup();
  for (const p of ['/gift/1.mp4', '/gift/../1', '/gift/1%2F..%2F2', '/gift/-1', '/gift/01x']) {
    assert.equal((await get(env, 'tok-ana', p)).status, 404, p);
  }
  // /gift/01 is id 1 for its owner (Number('01') === 1), nobody else's.
  assert.equal((await get(env, 'tok-bo', '/gift/01')).status, 403);
});

test('/me carries the gift only for a student who has one', async () => {
  const env = setup();
  const ana = await (await get(env, 'tok-ana', '/me')).json();
  assert.deepEqual(ana.gift, { url: '/gift/1' });
  const bo = await (await get(env, 'tok-bo', '/me')).json();
  assert.equal(bo.gift, null);
  // The instructor viewing as a student sees that student's, read-only.
  const asAna = await (await get(env, 'tok-teach', '/me?as=1')).json();
  assert.deepEqual(asAna.gift, { url: '/gift/1' });
});

test('the instructor roster and student page say who has a video', async () => {
  const env = setup();
  const data = await (await get(env, 'tok-teach', '/instructor/data')).json();
  const byId = new Map(data.roster.map((s) => [s.id, s]));
  assert.deepEqual(byId.get(1).gift, { url: '/gift/1' });
  assert.equal(byId.get(2).gift, null);
  const page = await (await get(env, 'tok-teach', '/instructor/student?id=1')).json();
  assert.deepEqual(page.gift, { url: '/gift/1' });
  assert.equal((await (await get(env, 'tok-teach', '/instructor/student?id=2')).json()).gift, null);
});

test('without the bucket bound nothing breaks', async () => {
  const env = setup();
  delete env.GIFTS;
  assert.equal((await (await get(env, 'tok-ana', '/me')).json()).gift, null);
  assert.equal((await get(env, 'tok-ana', '/gift/1')).status, 503);
});
