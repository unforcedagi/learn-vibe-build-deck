// Final demo sign-up: the real fetch handler over an in-memory D1 (node:sqlite).
// Claim, one slot per student, lock, the instructor's reorder (swap), auth, the
// closed flag with its preview accounts, and what classmates can see.
// Invented names only. The clock is pinned (mock.timers), so the daily CI run
// keeps passing after the demo days arrive.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const { DEMO_DAYS } = await import(new URL('../src/weeks.generated.js', here));
const schema = readFileSync(new URL('../schema.sql', here), 'utf8');

const [DAY1, DAY2] = DEMO_DAYS.map((d) => d.date);
const BEFORE = Date.parse('2026-11-10T18:00:00Z'); // weeks before either day

// D1 shim: prepare/bind/first/all/run, plus batch() as one transaction.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return {
    db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map((s) => ({ meta: { changes: db.prepare(s.sql).run(...s.args).changes } }));
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

const tok = (t) => createHash('sha256').update(t).digest('hex');
function setup({ open = false } = {}) {
  const DB = fakeD1();
  const add = DB.db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, ?)');
  add.run(1, '101', 'Ana Quillfeather', 'ana@example.invalid', 0);
  add.run(2, '102', 'Bo Lanternwick', 'bo@example.invalid', 0);
  add.run(3, null, 'Teacher Example', 'teach@example.invalid', 1);
  add.run(4, '104', 'Preview Person', 'preview@example.invalid', 0);
  const ses = DB.db.prepare('INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)');
  for (const [t, id] of [['ana', 1], ['bo', 2], ['teach', 3], ['preview', 4]]) ses.run(tok(t), id, '2099-01-01T00:00:00.000Z');
  if (open) DB.db.prepare("INSERT INTO demo_settings (id, signup_open, updated_at) VALUES (1, 1, 'x')").run();
  return { DB, SITE_ORIGIN: 'https://cu.learnvibe.build', DEMO_PREVIEW: 'someone@else.invalid, PREVIEW@example.invalid' };
}

const call = (env, token, method, path, body) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  method,
  headers: { ...(token ? { Cookie: `lvb_session=${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env);
const rows = (env) => env.DB.db.prepare('SELECT day, position, student_id, guest_name, title FROM demo_slots ORDER BY day, position').all()
  .map((r) => ({ ...r }));
const claim = (env, who, day, position, title = 'A tide chart') => call(env, who, 'POST', '/demos/claim', { day, position, title });
const slot = (state, day, pos) => state.days.find((d) => d.date === day).slots[pos - 1];

beforeEach(() => mock.timers.enable({ apis: ['Date'], now: BEFORE }));
afterEach(() => mock.timers.reset());

test('the demo days come from semester.json: two days, the first starting 5:05 PM', async () => {
  assert.equal(DEMO_DAYS.length, 2);
  const env = setup({ open: true });
  const s = await (await call(env, 'ana', 'GET', '/demos')).json();
  assert.deepEqual(s.days.map((d) => d.slots.length), [13, 13]);
  assert.equal(slot(s, DAY1, 1).time, '5:05 PM');
  assert.equal(slot(s, DAY1, 2).time, '5:15 PM');
  assert.equal(slot(s, DAY1, 13).time, '7:05 PM');
  // No start time in semester.json for day 2: no times, the page says "to be confirmed".
  assert.equal(slot(s, DAY2, 1).time, DEMO_DAYS[1].starts ? slot(s, DAY2, 1).time : null);
});

test('auth: signed out gets 401 everywhere, a student gets 403 on every instructor route', async () => {
  const env = setup({ open: true });
  env.DB.db.prepare("INSERT INTO demo_slots (id, day, position, student_id, title, created_at, updated_at) VALUES (7, ?, 1, 1, 'A', 'x', 'x')").run(DAY1);
  const before = rows(env);
  const routes = [
    ['GET', '/demos'], ['POST', '/demos/claim', { day: DAY1, position: 2, title: 'x' }], ['DELETE', '/demos/claim'],
    ['GET', '/instructor/demos'], ['POST', '/instructor/demos/move', { id: 7, day: DAY1, position: 2 }],
    ['POST', '/instructor/demos/guest', { day: DAY1, position: 3, name: 'G', title: 'x' }],
    ['POST', '/instructor/demos/settings', { signup_open: false }], ['GET', '/instructor/demos/export'],
    ['PATCH', '/instructor/demos/7', { title: 'changed' }], ['DELETE', '/instructor/demos/7'],
  ];
  for (const [m, p, b] of routes) assert.equal((await call(env, null, m, p, b)).status, 401, `${m} ${p} signed out`);
  for (const [m, p, b] of routes.filter(([, p]) => p.startsWith('/instructor'))) {
    assert.equal((await call(env, 'ana', m, p, b)).status, 403, `${m} ${p} as a student`);
  }
  assert.deepEqual(rows(env), before, 'nothing changed');
  assert.equal(JSON.parse(await (await call(env, 'ana', 'GET', '/instructor/demos')).text()).error, 'forbidden');
});

test('a student can\'t reorder: move is 403 and the order stays', async () => {
  const env = setup({ open: true });
  assert.equal((await claim(env, 'ana', DAY1, 1)).status, 200);
  assert.equal((await claim(env, 'bo', DAY1, 2)).status, 200);
  const id = env.DB.db.prepare('SELECT id FROM demo_slots WHERE student_id = 2').get().id;
  const res = await call(env, 'bo', 'POST', '/instructor/demos/move', { id, day: DAY1, position: 1 });
  assert.equal(res.status, 403);
  assert.deepEqual(rows(env).map((r) => [r.position, r.student_id]), [[1, 1], [2, 2]]);
});

test('claim: the slot is theirs, highlighted for them, first name and title for classmates', async () => {
  const env = setup({ open: true });
  const res = await claim(env, 'ana', DAY1, 3, '  Tide   chart for surfers ');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const mine = await res.json();
  assert.deepEqual(mine.mine, { day: DAY1, label: 'Monday, November 30', position: 3, title: 'Tide chart for surfers', time: '5:25 PM' });
  assert.equal(slot(mine, DAY1, 3).mine, true);
  assert.deepEqual(rows(env), [{ day: DAY1, position: 3, student_id: 1, guest_name: null, title: 'Tide chart for surfers' }]);

  const seen = await (await call(env, 'bo', 'GET', '/demos')).json();
  assert.deepEqual(slot(seen, DAY1, 3), { position: 3, time: '5:25 PM', taken: true, name: 'Ana', title: 'Tide chart for surfers', guest: false, mine: false });
  const text = JSON.stringify(seen);
  for (const secret of ['Quillfeather', 'ana@example', '"id"', 'student_id']) assert.ok(!text.includes(secret), `classmates never see ${secret}`);
  assert.equal(seen.mine, null);
});

test('claim: a taken slot is 409 and unchanged; bad input is 400', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 1);
  const res = await claim(env, 'bo', DAY1, 1, 'Mine now');
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'slot_taken');
  assert.deepEqual(rows(env).map((r) => [r.student_id, r.title]), [[1, 'A tide chart']]);
  for (const [body, error] of [
    [{ day: '2026-09-14', position: 1, title: 't' }, 'bad_day'],
    [{ day: DAY1, position: 0, title: 't' }, 'bad_position'],
    [{ day: DAY1, position: 14, title: 't' }, 'bad_position'],
    [{ day: DAY1, position: 2, title: '   ' }, 'title_required'],
    [{ day: DAY1, position: 2, title: 'x'.repeat(101) }, 'title_too_long'],
  ]) {
    const r = await call(env, 'bo', 'POST', '/demos/claim', body);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, error);
  }
  assert.equal(rows(env).length, 1);
});

test('one slot per student: claiming again moves them, release frees it', async () => {
  const env = setup({ open: true });
  assert.equal((await claim(env, 'ana', DAY1, 1, 'First idea')).status, 200);
  assert.equal((await claim(env, 'ana', DAY2, 5, 'Better idea')).status, 200);
  assert.deepEqual(rows(env), [{ day: DAY2, position: 5, student_id: 1, guest_name: null, title: 'Better idea' }]);
  // The database refuses a second row for the same student, whatever the handler does.
  assert.throws(() => env.DB.db.prepare("INSERT INTO demo_slots (day, position, student_id, title, created_at, updated_at) VALUES (?, 9, 1, 't', 'x', 'x')").run(DAY1), /UNIQUE/);
  const rel = await call(env, 'ana', 'DELETE', '/demos/claim');
  assert.equal(rel.status, 200);
  assert.equal((await rel.json()).mine, null);
  assert.deepEqual(rows(env), []);
  assert.equal((await call(env, 'ana', 'DELETE', '/demos/claim')).status, 404);
});

test('view-as: the instructor reads a student\'s page read-only; a student passing ?as gets 403', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 2);
  const as = await (await call(env, 'teach', 'GET', '/demos?as=1')).json();
  assert.equal(as.mine.position, 2);
  assert.equal(as.can_claim, false);
  assert.equal(as.read_only, true);
  assert.equal((await call(env, 'bo', 'GET', '/demos?as=1')).status, 403);
  assert.equal((await call(env, 'teach', 'POST', '/demos/claim?as=1', { day: DAY1, position: 3, title: 't' })).status, 403);
  assert.equal(rows(env)[0].position, 2);
});

test('a row on a night that left the calendar stays visible to the instructor and can be moved back', async () => {
  const env = setup({ open: true });
  env.DB.db.prepare("INSERT INTO demo_slots (id, day, position, student_id, title, created_at, updated_at) VALUES (5, '2026-12-07', 2, 2, 'Bo build', 'x', 'x')").run();
  const s = await (await call(env, 'teach', 'GET', '/instructor/demos')).json();
  assert.deepEqual(s.elsewhere, [{ id: 5, day: '2026-12-07', position: 2, title: 'Bo build', guest: false, name: 'Bo Lanternwick' }]);
  assert.ok(!s.not_signed_up.some((x) => x.id === 2));
  const moved = await (await call(env, 'teach', 'POST', '/instructor/demos/move', { id: 5, day: DAY1, position: 1 })).json();
  assert.deepEqual(moved.elsewhere, []);
  assert.equal(slot(moved, DAY1, 1).name, 'Bo Lanternwick');
});

test('move without a numeric id is 400', async () => {
  const env = setup({ open: true });
  for (const id of [undefined, '3', 1.5]) {
    assert.equal((await call(env, 'teach', 'POST', '/instructor/demos/move', { id, day: DAY1, position: 1 })).status, 400);
  }
});

test('a student can only release their own slot', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 1);
  assert.equal((await call(env, 'bo', 'DELETE', '/demos/claim')).status, 404);
  assert.equal(rows(env).length, 1);
});

test('lock: after the lock time students can\'t claim, move or release; the instructor still can', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 1);
  const set = await call(env, 'teach', 'POST', '/instructor/demos/settings', { lock_at: '2026-11-10T17:00:00.000Z' });
  assert.equal(set.status, 200);
  assert.equal((await set.json()).settings.locked, true);
  const before = rows(env);
  for (const res of [await claim(env, 'bo', DAY1, 2), await claim(env, 'ana', DAY1, 4), await call(env, 'ana', 'DELETE', '/demos/claim')]) {
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'locked');
  }
  assert.deepEqual(rows(env), before);
  assert.equal((await (await call(env, 'ana', 'GET', '/demos')).json()).locked, true);
  const id = env.DB.db.prepare('SELECT id FROM demo_slots').get().id;
  assert.equal((await call(env, 'teach', 'POST', '/instructor/demos/move', { id, day: DAY1, position: 2 })).status, 200);
  // A lock in the future doesn't lock yet; clearing it reopens.
  await call(env, 'teach', 'POST', '/instructor/demos/settings', { lock_at: '2026-11-25T00:00:00Z' });
  assert.equal((await claim(env, 'bo', DAY1, 3)).status, 200);
  assert.equal((await (await call(env, 'teach', 'POST', '/instructor/demos/settings', { lock_at: null })).json()).settings.lock_at, null);
  assert.equal((await call(env, 'teach', 'POST', '/instructor/demos/settings', { lock_at: 'soon' })).status, 400);
});

test('a demo day closes to student changes on its own morning (Denver)', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 1);
  mock.timers.setTime(Date.parse(`${DAY1}T08:00:00Z`)); // 1 AM in Denver on day 1
  assert.equal((await claim(env, 'bo', DAY1, 2)).status, 403);
  assert.equal((await claim(env, 'ana', DAY2, 1)).status, 403, 'can\'t leave day 1 either');
  assert.equal((await call(env, 'ana', 'DELETE', '/demos/claim')).status, 403);
  assert.equal((await claim(env, 'bo', DAY2, 2)).status, 200, 'day 2 is still open');
  const s = await (await call(env, 'bo', 'GET', '/demos')).json();
  assert.deepEqual(s.days.map((d) => d.closed), [true, false]);
});

test('reorder: the instructor swaps, moves up, down and across days, and adds a guest', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 1, 'Ana build');
  await claim(env, 'bo', DAY1, 2, 'Bo build');
  const idOf = (sid) => env.DB.db.prepare('SELECT id FROM demo_slots WHERE student_id = ?').get(sid).id;
  const move = (id, day, position) => call(env, 'teach', 'POST', '/instructor/demos/move', { id, day, position });
  const order = () => rows(env).map((r) => [r.day === DAY1 ? 1 : 2, r.position, r.student_id ?? r.guest_name]);

  let res = await move(idOf(2), DAY1, 1); // Bo up: the two swap
  assert.equal(res.status, 200);
  assert.deepEqual(order(), [[1, 1, 2], [1, 2, 1]]);
  const full = await res.json();
  assert.equal(slot(full, DAY1, 1).name, 'Bo Lanternwick', 'the instructor sees full names');
  assert.deepEqual(full.not_signed_up.map((s) => s.name), ['Preview Person']);

  assert.equal((await move(idOf(2), DAY1, 2)).status, 200); // Bo down again
  assert.deepEqual(order(), [[1, 1, 1], [1, 2, 2]]);
  assert.equal((await move(idOf(1), DAY2, 4)).status, 200); // Ana to the other day
  assert.deepEqual(order(), [[1, 2, 2], [2, 4, 1]]);
  assert.equal((await move(idOf(2), DAY2, 4)).status, 200); // a swap across days
  assert.deepEqual(order(), [[1, 2, 1], [2, 4, 2]]);

  res = await call(env, 'teach', 'POST', '/instructor/demos/guest', { day: DAY1, position: 7, name: 'Visiting Auditor', title: 'Garden sensors' });
  assert.equal(res.status, 201);
  assert.equal((await call(env, 'teach', 'POST', '/instructor/demos/guest', { day: DAY1, position: 7, name: 'X', title: 'Y' })).status, 409);
  const guestId = env.DB.db.prepare('SELECT id FROM demo_slots WHERE guest_name IS NOT NULL').get().id;
  assert.equal((await move(guestId, DAY1, 2)).status, 200); // guest swaps with Ana
  assert.deepEqual(order(), [[1, 2, 'Visiting Auditor'], [1, 7, 1], [2, 4, 2]]);
  const seen = await (await call(env, 'bo', 'GET', '/demos')).json();
  assert.deepEqual([slot(seen, DAY1, 2).name, slot(seen, DAY1, 2).guest], ['Visiting', true]);

  assert.equal((await move(9999, DAY1, 3)).status, 404);
  assert.equal((await move(guestId, DAY1, 14)).status, 400);
  assert.equal((await call(env, 'teach', 'PATCH', `/instructor/demos/${guestId}`, { name: 'Visiting Friend', title: 'Garden sensors v2' })).status, 200);
  assert.equal((await call(env, 'teach', 'PATCH', `/instructor/demos/${idOf(1)}`, { name: 'Renamed' })).status, 400, 'a student\'s name comes from the roster');
  assert.equal((await call(env, 'teach', 'DELETE', `/instructor/demos/${guestId}`)).status, 200);
  assert.deepEqual(order(), [[1, 7, 1], [2, 4, 2]]);
});

test('a failed swap rolls back whole', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 1);
  await claim(env, 'bo', DAY1, 2);
  const before = rows(env);
  const realBatch = env.DB.batch.bind(env.DB);
  env.DB.batch = (list) => realBatch([...list.slice(0, 2), env.DB.prepare('UPDATE demo_slots SET position = 2 WHERE student_id = 2')]);
  const id = env.DB.db.prepare('SELECT id FROM demo_slots WHERE student_id = 2').get().id;
  const res = await call(env, 'teach', 'POST', '/instructor/demos/move', { id, day: DAY1, position: 1 });
  assert.equal(res.status, 409);
  assert.deepEqual(rows(env), before);
});

test('closed (the default): no links, no list, no claims, except a preview account', async () => {
  const env = setup();
  assert.deepEqual(await (await call(env, null, 'GET', '/demos/status')).json(), { linked: false });
  assert.deepEqual(await (await call(env, 'ana', 'GET', '/demos/status')).json(), { linked: false });
  assert.deepEqual(await (await call(env, 'ana', 'GET', '/demos')).json(), { open: false });
  assert.equal((await (await call(env, 'ana', 'GET', '/me')).json()).demo_signup.linked, false);
  const res = await claim(env, 'ana', DAY1, 1);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'not_open');
  assert.equal((await call(env, 'ana', 'DELETE', '/demos/claim')).status, 403);
  assert.deepEqual(rows(env), []);

  // The preview account (DEMO_PREVIEW, case-insensitive) gets the whole flow.
  assert.deepEqual(await (await call(env, 'preview', 'GET', '/demos/status')).json(), { linked: true });
  assert.equal((await claim(env, 'preview', DAY2, 2)).status, 200);
  const me = await (await call(env, 'preview', 'GET', '/me')).json();
  assert.deepEqual(me.demo_signup, { linked: true, mine: { day: DAY2, label: 'Friday, December 4', position: 2, title: 'A tide chart', time: null } });
  const s = await (await call(env, 'preview', 'GET', '/demos')).json();
  assert.equal(s.open, true);
  assert.equal(s.preview, true);
  // The instructor sees it closed or not, but claims through the instructor view.
  assert.equal((await (await call(env, 'teach', 'GET', '/demos')).json()).open, true);
  assert.equal((await claim(env, 'teach', DAY1, 1)).status, 403);
});

test('opening it is the flag: links for everyone, students can claim', async () => {
  const env = setup();
  const res = await call(env, 'teach', 'POST', '/instructor/demos/settings', { signup_open: true });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).settings.signup_open, true);
  assert.deepEqual(await (await call(env, null, 'GET', '/demos/status')).json(), { linked: true });
  assert.equal((await claim(env, 'bo', DAY1, 1)).status, 200);
  assert.equal((await call(env, 'teach', 'POST', '/instructor/demos/settings', { signup_open: 'yes' })).status, 400);
  await call(env, 'teach', 'POST', '/instructor/demos/settings', { signup_open: false });
  assert.deepEqual(await (await call(env, 'bo', 'GET', '/demos')).json(), { open: false });
});

test('export: the running order as plain text with full names and times', async () => {
  const env = setup({ open: true });
  await claim(env, 'ana', DAY1, 1, 'Tide chart');
  await claim(env, 'bo', DAY2, 3, 'Recipe app');
  await call(env, 'teach', 'POST', '/instructor/demos/guest', { day: DAY1, position: 2, name: 'Visiting Auditor', title: 'Garden sensors' });
  const res = await call(env, 'teach', 'GET', '/instructor/demos/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/plain/);
  const text = await res.text();
  assert.match(text, /Monday, November 30 · starts 5:05 PM/);
  assert.match(text, / 1  5:05 PM +Ana Quillfeather: Tide chart/);
  assert.match(text, / 2  5:15 PM +Visiting Auditor \(guest\): Garden sensors/);
  assert.match(text, / 3  5:25 PM +\(open\)/);
  assert.match(text, /Friday, December 4 · time to be confirmed/);
  assert.match(text, / 3  slot 3 +Bo Lanternwick: Recipe app/);
});
