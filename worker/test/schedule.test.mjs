// Guards the one-file semester calendar (schedule/semester.json).
//
// Fails if the generated pages or the Worker's WEEKS disagree with the
// calendar, or if the calendar runs out within two weeks. The page check runs
// the real generator (python3 tools/build_schedule.py --check).
//   node --test worker/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const semester = JSON.parse(readFileSync(new URL('schedule/semester.json', root), 'utf8'));
const { WEEKS } = await import(new URL('worker/src/weeks.generated.js', root));
const classes = semester.meetings.filter((m) => m.kind !== 'no-class');

const generator = (...args) => spawnSync('python3', ['tools/build_schedule.py', '--check', ...args],
  { cwd: root, encoding: 'utf8' });

test('WEEKS is exactly the assignments in semester.json', () => {
  const expected = classes.filter((m) => m.assignment).map((m) => ({
    week: m.week,
    title: m.assignment.title,
    due_at: m.assignment.due_at,
    canvas_url: `${semester.term.canvas_course}/assignments/${m.assignment.canvas_id}`,
    prompt: m.assignment.prompt,
  }));
  assert.deepEqual(WEEKS, expected);
});

test('due dates are in week order and fall after their class', () => {
  let last = 0;
  for (const m of classes.filter((c) => c.assignment)) {
    const due = Date.parse(m.assignment.due_at);
    assert.ok(due >= last, `week ${m.week} is due before the week before it`);
    assert.ok(due > Date.parse(m.date), `week ${m.week} is due before its class`);
    last = due;
  }
});

test('the pages and WEEKS file match semester.json for today', () => {
  const run = generator();
  assert.equal(run.status, 0, run.stderr || run.stdout);
});

test('the calendar has at least 14 days of runway, or reaches the last day of term', () => {
  const last = semester.meetings.at(-1).date;
  const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const need = soon < semester.term.last_day ? soon : semester.term.last_day;
  assert.ok(last >= need, `semester.json ends ${last}; add meetings through ${need}`);
  assert.equal(last, semester.term.last_day, 'the last meeting should be the last day of term');
});

test('the current week switches on its own on Monday (check goes stale at the next class)', () => {
  // Today's committed pages are for one week; the day of the next class they are out of date.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: semester.term.timezone });
  const next = classes.find((m) => m.date > today);
  if (!next) return; // term over
  const stale = generator('--date', next.date);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /out of date/);
  assert.match(stale.stderr, /index\.html/);
});

test('every class in the term renders without error', () => {
  for (const m of classes) {
    const run = generator('--date', m.date);
    assert.ok(run.status === 0 || /out of date/.test(run.stderr), `week ${m.week}: ${run.stderr}`);
  }
});
