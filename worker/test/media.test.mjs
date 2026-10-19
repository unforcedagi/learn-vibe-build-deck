// Class media: the class film shows first names, so only signed-in classmates may fetch it.
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
function fakeR2() {
  return {
    async get(key, opts) {
      if (key !== 'film.mp4') return null;
      const r = opts?.range;
      let start = 0, len = BYTES.length;
      if (r) {
        if (r.suffix !== undefined) { start = BYTES.length - r.suffix; len = r.suffix; }
        else { start = r.offset; len = r.length ?? BYTES.length - r.offset; }
      }
      return { size: BYTES.length, range: r, httpMetadata: { contentType: 'video/mp4' }, body: BYTES.slice(start, start + len) };
    },
  };
}

function setup() {
  const DB = fakeD1();
  DB.db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (1, ?, ?, ?, 0)').run('1', 'Ana Example', 'ana@example.invalid');
  DB.db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, 1, ?)')
    .run(createHash('sha256').update('tok-ana').digest('hex'), '2099-01-01T00:00:00.000Z');
  return { DB, MEDIA: fakeR2(), SITE_ORIGIN: 'https://cu.learnvibe.build' };
}

const get = (env, signedIn, path, headers = {}) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  headers: { ...(signedIn ? { Cookie: 'lvb_session=tok-ana' } : {}), ...headers },
}), env);

test('signed-out request for class media gets 401', async () => {
  const res = await get(setup(), false, '/media/film.mp4');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('signed-in classmate gets the whole file', async () => {
  const res = await get(setup(), true, '/media/film.mp4');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'video/mp4');
  assert.match(res.headers.get('Cache-Control'), /^private/);
  assert.equal((await res.text()), '0123456789abcdefghij');
});

test('range requests return 206 with the right slice', async () => {
  const res = await get(setup(), true, '/media/film.mp4', { Range: 'bytes=2-5' });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('Content-Range'), 'bytes 2-5/20');
  assert.equal(await res.text(), '2345');
  const open = await get(setup(), true, '/media/film.mp4', { Range: 'bytes=18-' });
  assert.equal(open.headers.get('Content-Range'), 'bytes 18-19/20');
});

test('unknown keys 404 and path tricks never match', async () => {
  assert.equal((await get(setup(), true, '/media/nope.mp4')).status, 404);
  assert.equal((await get(setup(), true, '/media/../secrets')).status, 404);
});
