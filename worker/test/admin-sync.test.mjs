// The sync API the uni timers use instead of a Cloudflare account token
// (/admin/sync/*): only the admin key gets in (no key 401, any session 403,
// the instructor's too); Canvas never overwrites a student's site text; file
// rows and objects land where the instructor view reads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, TOKENS } from './fixtures/fp-prompt-fixture.mjs';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;

const KEY = 'test-admin-key-not-real';
const env0 = () => ({ ...fixtureEnv(), ADMIN_KEY: KEY });

function call(env, method, path, { key, tok, body, raw, type } = {}) {
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (tok) headers.Cookie = `lvb_session=${tok}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (type) headers['Content-Type'] = type;
  return worker.fetch(new Request('https://api.learnvibe.build' + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : raw,
  }), env);
}

const ENDPOINTS = [
  ['GET', '/admin/sync/students'],
  ['GET', '/admin/sync/submissions'],
  ['GET', '/admin/sync/board-posts'],
  ['GET', '/admin/sync/student-reads'],
  ['GET', '/admin/sync/files'],
  ['POST', '/admin/sync/canvas', { body: { students: [], submissions: [] } }],
  ['POST', '/admin/sync/student-reads', { body: { reads: [{ student_id: 1, body: 'x', input_hash: 'h', based_on: null, model: null }] } }],
  ['POST', '/admin/sync/files', { body: { groups: [{ week: 4, canvas_id: '1', rows: [], keep: ['cf-one-html', 'cf-one-docx'] }] } }],
  ['PUT', '/admin/sync/object/files/123/p1.jpg', { raw: 'JPEG', type: 'image/jpeg' }],
  ['POST', '/admin/sync/object/files/123/rendition?uploads', {}],
];

test('every sync endpoint: no key 401, wrong key 401, student or instructor session 403, key 200', async () => {
  for (const [method, path, opts = {}] of ENDPOINTS) {
    const env = env0();
    const name = `${method} ${path}`;
    assert.equal((await call(env, method, path, opts)).status, 401, `${name} without a key`);
    assert.equal((await call(env, method, path, { ...opts, key: 'wrong' })).status, 401, `${name} with a wrong key`);
    assert.equal((await call(env, method, path, { ...opts, tok: TOKENS.one })).status, 403, `${name} as a student`);
    assert.equal((await call(env, method, path, { ...opts, tok: TOKENS.prof })).status, 403, `${name} as the instructor`);
    const ok = await call(env, method, path, { ...opts, key: KEY });
    assert.equal(ok.status, 200, `${name} with the key`);
    assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  }
});

test('no ADMIN_KEY secret means nobody gets in', async () => {
  const env = { ...fixtureEnv() };
  assert.equal((await call(env, 'GET', '/admin/sync/submissions', { key: 'undefined' })).status, 401);
});

test('reads: only the named sets, with the fields the timers use', async () => {
  const env = env0();
  const subs = (await (await call(env, 'GET', '/admin/sync/submissions', { key: KEY })).json()).rows;
  assert.equal(subs.length, 5);
  assert.deepEqual(Object.keys(subs[0]).sort(), ['body', 'canvas_id', 'email', 'id', 'is_instructor', 'link_url', 'name',
    'share_build', 'share_writing', 'student_id', 'submitted_at', 'week']);
  const posts = (await (await call(env, 'GET', '/admin/sync/board-posts', { key: KEY })).json()).rows;
  assert.deepEqual(posts.map((p) => p.pod_name), [null, 'Pod Tide', null]);
  const reads = (await (await call(env, 'GET', '/admin/sync/student-reads', { key: KEY })).json()).rows;
  assert.deepEqual(reads, [{ student_id: 1, input_hash: 'h1' }, { student_id: 2, input_hash: 'h2' }]);
  const files = (await (await call(env, 'GET', '/admin/sync/files', { key: KEY })).json()).rows;
  assert.equal(files.length, 3);
  assert.equal(files[0].text, undefined, 'file text stays out of the listing');
  assert.equal((await call(env, 'GET', '/admin/sync/sessions', { key: KEY })).status, 404);
  assert.equal((await call(env, 'GET', '/admin/sync/constructor', { key: KEY })).status, 404);
});

test('canvas: roster upserts; Canvas fills empty rows and never overwrites a student\'s site text', async () => {
  const env = env0();
  const { db } = env.DB;
  db.prepare('INSERT INTO submissions (student_id, week, body, submitted_at, link_url) VALUES (2, 7, \'\', NULL, ?)').run('https://two.example/site');
  const res = await call(env, 'POST', '/admin/sync/canvas', { key: KEY, body: {
    students: [
      { canvas_id: '2', name: 'E2E Two Renamed', email: 'E2E-Test-2@learnvibe.build', login_alias: 'two@colorado.edu' },
      { canvas_id: '77', name: 'E2E New', email: 'e2e-test-new@learnvibe.build', login_alias: null },
    ],
    submissions: [
      { canvas_id: '1', week: 4, body: 'CANVAS text that must not win', submitted_at: '2026-10-02T00:00:00Z', link_url: null },
      { canvas_id: '2', week: 7, body: 'CANVAS fills the empty row', submitted_at: '2026-10-20T00:00:00Z', link_url: 'https://canvas.example/x' },
      { canvas_id: '77', week: 1, body: 'CANVAS new row', submitted_at: '2026-08-30T00:00:00Z', link_url: null },
      { canvas_id: '999', week: 1, body: 'nobody', submitted_at: null, link_url: null },
    ],
  } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.deepEqual(out.students, { sent: 2, written: 2 });
  assert.deepEqual(out.submissions, { sent: 4, written: 2 });
  const row = (sid, week) => db.prepare('SELECT body, link_url FROM submissions WHERE student_id = ? AND week = ?').get(sid, week);
  assert.match(row(1, 4).body, /^ONE-W4 build notes/);
  assert.deepEqual({ ...row(2, 7) }, { body: 'CANVAS fills the empty row', link_url: 'https://two.example/site' });
  const two = db.prepare('SELECT name, login_alias FROM students WHERE id = 2').get();
  assert.deepEqual({ ...two }, { name: 'E2E Two Renamed', login_alias: 'two@colorado.edu' });
  const fresh = db.prepare("SELECT s.id FROM students s WHERE canvas_id = '77'").get();
  assert.equal(row(fresh.id, 1).body, 'CANVAS new row');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM submissions').get().n, 7);
});

test('canvas: bad rows and oversized batches are refused whole', async () => {
  const env = env0();
  const before = env.DB.db.prepare('SELECT COUNT(*) n FROM students').get().n;
  const bad = await call(env, 'POST', '/admin/sync/canvas', { key: KEY, body: {
    students: [{ canvas_id: '5', name: 'E2E Ok', email: 'e2e-ok@learnvibe.build', login_alias: null },
      { canvas_id: "1' OR 1=1", name: 'x', email: 'x@learnvibe.build', login_alias: null }],
  } });
  assert.equal(bad.status, 400);
  assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM students').get().n, before);
  const many = Array.from({ length: 46 }, (_, i) => ({ canvas_id: String(100 + i), week: 1, body: 'x', submitted_at: null, link_url: null }));
  assert.equal((await call(env, 'POST', '/admin/sync/canvas', { key: KEY, body: { submissions: many } })).status, 413);
  const text = await call(env, 'POST', '/admin/sync/canvas', { key: KEY, raw: '{}', type: 'text/plain' });
  assert.equal(text.status, 415);
});

test('student reads: upsert by student', async () => {
  const env = env0();
  const res = await call(env, 'POST', '/admin/sync/student-reads', { key: KEY, body: { reads: [
    { student_id: 1, body: 'NEW-READ one', input_hash: 'h1b', based_on: '{"weeks":[1]}', model: 'opus' },
    { student_id: 3, body: 'NEW-READ empty', input_hash: 'h3', based_on: null, model: 'opus' },
  ] } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).written, 2);
  const rows = env.DB.db.prepare('SELECT student_id, body, input_hash FROM student_reads ORDER BY student_id').all();
  assert.deepEqual(rows.map((r) => [r.student_id, r.body, r.input_hash]),
    [[1, 'NEW-READ one', 'h1b'], [2, rows[1].body, 'h2'], [3, 'NEW-READ empty', 'h3']]);
});

const fileRow = (id, extra = {}) => ({
  canvas_file_id: id, position: 0, name: `${id}.pdf`, content_type: 'application/pdf', size: 10, kind: 'pdf',
  text: `TEXT ${id}`, pages: 1, rendition: null, rendition_type: null, canvas_url: `https://canvas.example/${id}`,
  status: 'ok', render_version: 1, ...extra,
});

test('files: upsert the new rows, prune files a resubmission dropped, leave other students alone', async () => {
  const env = env0();
  const { db } = env.DB;
  const res = await call(env, 'POST', '/admin/sync/files', { key: KEY, body: { groups: [
    // One's week 4 now has the docx (kept, not resent) and a new PDF; the HTML page was replaced.
    { week: 4, canvas_id: '1', rows: [fileRow('cf-one-new', { position: 1 })], keep: ['cf-one-docx', 'cf-one-new'] },
    // Two's week 3 resubmission has no files left.
    { week: 3, canvas_id: '2', rows: [], keep: [] },
  ] } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, sent: 1, written: 1, pruned: 2 });
  const ids = db.prepare('SELECT canvas_file_id, student_id, week, text FROM submission_files ORDER BY canvas_file_id').all();
  assert.deepEqual(ids.map((r) => [r.canvas_file_id, r.student_id, r.week]), [['cf-one-docx', 1, 4], ['cf-one-new', 1, 4]]);
  // Re-render of a known file updates it in place.
  await call(env, 'POST', '/admin/sync/files', { key: KEY, body: { groups: [
    { week: 4, canvas_id: '1', rows: [fileRow('cf-one-new', { text: 'TEXT v2', render_version: 2 })], keep: ['cf-one-docx', 'cf-one-new'] },
  ] } });
  const v2 = db.prepare("SELECT text, render_version FROM submission_files WHERE canvas_file_id = 'cf-one-new'").get();
  assert.deepEqual({ ...v2 }, { text: 'TEXT v2', render_version: 2 });
  const bad = await call(env, 'POST', '/admin/sync/files', { key: KEY, body: { groups: [
    { week: 4, canvas_id: '1', rows: [fileRow('x', { pages: -1 })], keep: ['x'] }] } });
  assert.equal(bad.status, 400);
});

test('objects: only files/<id>/p<n>.jpg or rendition; plain and multipart uploads land in FILES', async () => {
  const env = env0();
  const put = await call(env, 'PUT', '/admin/sync/object/files/4242/p1.jpg', { key: KEY, raw: 'JPEG-BYTES', type: 'image/jpeg' });
  assert.equal(put.status, 200);
  assert.equal(new TextDecoder().decode(env.FILES.objects.get('files/4242/p1.jpg')), 'JPEG-BYTES');
  for (const bad of ['gift/1.mp4', 'files/4242/../x', 'files/4242/p1.png', 'files/4242', 'files/a b/rendition']) {
    const res = await call(env, 'PUT', `/admin/sync/object/${bad}`, { key: KEY, raw: 'x' });
    assert.equal(res.status, 400, bad);
  }
  const start = await (await call(env, 'POST', '/admin/sync/object/files/4242/rendition?uploads', { key: KEY, type: 'video/mp4' })).json();
  const parts = [];
  for (const [n, chunk] of [[1, 'PART-ONE|'], [2, 'PART-TWO']]) {
    parts.push(await (await call(env, 'PUT', `/admin/sync/object/files/4242/rendition?upload_id=${start.upload_id}&part=${n}`,
      { key: KEY, raw: chunk })).json());
  }
  assert.deepEqual(parts.map((p) => p.part), [1, 2]);
  const done = await call(env, 'POST', `/admin/sync/object/files/4242/rendition?upload_id=${start.upload_id}`, { key: KEY, body: { parts } });
  assert.equal(done.status, 200);
  assert.equal(new TextDecoder().decode(env.FILES.objects.get('files/4242/rendition')), 'PART-ONE|PART-TWO');
  // A failed upload is aborted, not left open.
  const dead = await (await call(env, 'POST', '/admin/sync/object/files/4343/rendition?uploads', { key: KEY, raw: '' })).json();
  assert.equal(env.FILES.uploads.size, 1);
  assert.equal((await call(env, 'DELETE', `/admin/sync/object/files/4343/rendition?upload_id=${dead.upload_id}`, { key: KEY })).status, 200);
  assert.equal(env.FILES.uploads.size, 0);
  assert.equal((await call(env, 'DELETE', '/admin/sync/object/files/4343/rendition?upload_id=x')).status, 401);
});

test('objects: a zero-byte file is stored empty, not refused (it would stop every nightly run)', async () => {
  const env = env0();
  // Workers hand a zero-length request a null body; no body at all models that.
  const res = await call(env, 'PUT', '/admin/sync/object/files/4444/rendition', { key: KEY, type: 'text/html' });
  assert.equal(res.status, 200);
  assert.equal(env.FILES.objects.get('files/4444/rendition').length, 0);
});

test('a client body with its own "error" key is still read as data', async () => {
  const env = env0();
  const res = await call(env, 'POST', '/admin/sync/canvas', { key: KEY, body: {
    error: 'x', students: [{ canvas_id: '88', name: 'E2E Err', email: 'e2e-err@learnvibe.build', login_alias: null }] } });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).students, { sent: 1, written: 1 });
});
