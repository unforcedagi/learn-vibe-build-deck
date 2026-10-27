// Instructor student page (GET /instructor/student?id=): instructor session
// only, never cached, and it carries exactly one student's work and AI read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, TOKENS } from './fixtures/fp-prompt-fixture.mjs';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;

const get = (env, tok, q) => worker.fetch(new Request('https://api.learnvibe.build/instructor/student' + q, {
  headers: tok ? { Cookie: `lvb_session=${tok}` } : {},
}), env);

test('the instructor gets one student: header, strip, timeline, posts and their own read', async () => {
  const env = fixtureEnv();
  const res = await get(env, TOKENS.prof, '?id=1');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const d = await res.json();
  assert.equal(d.student.name, 'E2E One');
  assert.equal(d.pod.name, 'Pod Tide');
  assert.deepEqual(d.submissions.map((s) => s.week), [1, 4, 6]);
  assert.equal(d.last_submission_at, '2026-10-11T12:00:00Z');
  assert.deepEqual(d.strip.slice(0, 4).map((s) => s.status), ['on_time', 'missing', 'missing', 'on_time']);
  assert.deepEqual(d.posts.map((p) => p.title), ['ONE-POST tide demo', 'ONE-PODPOST data question']);
  assert.equal(d.posts[1].pod_name, 'Pod Tide');
  assert.match(d.read.body, /ONE-READ/);
  assert.deepEqual(d.read.based_on.weeks, [1, 4, 6]);
  const all = JSON.stringify(d);
  for (const s of ['TWO-', 'two.example', 'E2E Two']) assert.ok(!all.includes(s), `leaked ${s}`);
});

test('late work is flagged against the week due date', async () => {
  const d = await (await get(fixtureEnv(), TOKENS.prof, '?id=2')).json();
  assert.deepEqual(d.submissions.map((s) => [s.week, s.late]), [[2, false], [3, true]]);
  assert.deepEqual(d.strip.slice(0, 3).map((s) => s.status), ['missing', 'on_time', 'late']);
  assert.match(d.read.body, /TWO-READ/);
  assert.ok(!JSON.stringify(d).includes('ONE-'));
});

test('a student without a read gets read: null, not someone else\'s', async () => {
  const d = await (await get(fixtureEnv(), TOKENS.prof, '?id=3')).json();
  assert.equal(d.read, null);
  assert.deepEqual([d.submissions, d.posts, d.last_submission_at], [[], [], null]);
});

test('students get 403 (even for themselves), signed out 401, bad ids 400/404', async () => {
  const env = fixtureEnv();
  assert.equal((await get(env, TOKENS.one, '?id=1')).status, 403);
  assert.equal((await get(env, TOKENS.one, '?id=2')).status, 403);
  assert.equal((await get(env, TOKENS.two, '?id=1')).status, 403);
  assert.equal((await get(env, null, '?id=1')).status, 401);
  assert.equal((await get(env, TOKENS.prof, '?id=abc')).status, 400);
  assert.equal((await get(env, TOKENS.prof, '?id=9')).status, 404, 'the instructor row is not a student page');
  assert.equal((await get(env, TOKENS.prof, '?id=999')).status, 404);
});
