// Guards the submission window so it can't silently stick on one week again
// (it did: OPEN_WEEK was hard-coded to 3 and Weeks 4+ were rejected).
//
// Runs the real Worker fetch handler against an in-memory SQLite database
// shaped like D1, with a signed-in test student. No network, no prod data.
//   node --test worker/test/
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

const TOKEN = 'test-session-token';
function setup() {
  const DB = fakeD1();
  DB.db.prepare("INSERT INTO students (id, canvas_id, name, email) VALUES (1, 'test', 'Test Student', 'test@example.invalid')").run();
  const hash = createHash('sha256').update(TOKEN).digest('hex');
  DB.db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, 1, ?)').run(hash, '2099-01-01T00:00:00.000Z');
  return { DB, SITE_ORIGIN: 'https://cu.learnvibe.build' };
}

const req = (path, body) => new Request('https://api.learnvibe.build' + path, {
  method: body ? 'POST' : 'GET',
  headers: { Cookie: `lvb_session=${TOKEN}`, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

const submission = (week) => ({
  week, link_url: 'https://example.com/build', share_build: false, share_writing: false,
  body: 'A paragraph of reflection long enough to pass the minimum length check, written for the test. '.repeat(2),
});

async function at(iso, fn) {
  const real = Date.now;
  Date.now = () => Date.parse(iso);
  try { return await fn(); } finally { Date.now = real; }
}

test('open week follows the calendar instead of sticking', async () => {
  const env = setup();
  const cases = [['2026-09-29T18:00:00Z', 4], ['2026-10-05T18:00:00Z', 6], ['2026-10-13T18:00:00Z', 7]];
  for (const [when, expected] of cases) {
    const me = await at(when, async () => (await worker.fetch(req('/me'), env)).json());
    assert.equal(me.open_week, expected, `open week at ${when}`);
  }
});

test('a signed-in student can submit every week up to the open one, late included', async () => {
  const env = setup();
  await at('2026-10-05T18:00:00Z', async () => {
    for (const week of [1, 2, 3, 4, 5, 6]) {
      const res = await worker.fetch(req('/submissions', submission(week)), env);
      assert.equal(res.status, 200, `week ${week} should be accepted`);
    }
    const me = await (await worker.fetch(req('/me'), env)).json();
    assert.deepEqual(me.submissions.map((s) => s.week), [1, 2, 3, 4, 5, 6]);
  });
});

test('future weeks stay closed', async () => {
  const env = setup();
  await at('2026-10-05T18:00:00Z', async () => {
    const res = await worker.fetch(req('/submissions', submission(7)), env);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'week_closed');
  });
});

test('every published week is listed (WEEKS covers the calendar so far)', async () => {
  const env = setup();
  const me = await at('2026-10-05T18:00:00Z', async () => (await worker.fetch(req('/me'), env)).json());
  const weeks = me.weeks.map((w) => w.week);
  for (let w = 1; w <= 8; w++) assert.ok(weeks.includes(w), `week ${w} missing from WEEKS`);
});

test('signed-out requests are refused', async () => {
  const env = setup();
  const res = await worker.fetch(new Request('https://api.learnvibe.build/submissions', {
    method: 'POST', body: JSON.stringify(submission(6)), headers: { 'Content-Type': 'application/json' },
  }), env);
  assert.equal(res.status, 401);
});

// Real-clock check, run daily in CI: fails a week BEFORE the calendar runs out,
// so someone adds the next weeks to WEEKS before students hit a closed form.
test('WEEKS has at least a week of runway past today', async () => {
  const env = setup();
  const me = await (await worker.fetch(req('/me'), env)).json();
  const lastDue = Math.max(...me.weeks.map((w) => Date.parse(w.due_at)));
  const days = (lastDue - Date.now()) / 86400000;
  if (Date.now() > Date.parse('2026-12-20T00:00:00Z')) return; // semester over
  assert.ok(days >= 7, `WEEKS ends in ${days.toFixed(1)} days; add the next weeks to worker/src/index.js`);
});
