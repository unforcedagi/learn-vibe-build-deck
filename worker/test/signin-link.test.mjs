// Sign-in links: the instructor can make one for a student to hand over in
// person (POST /instructor/signin-link), every emailed link records what the
// Email Service said, and the student page lists recent attempts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, TOKENS } from './fixtures/fp-prompt-fixture.mjs';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const API = 'https://api.learnvibe.build';

function env(send = async () => ({ messageId: '<msg-1@learnvibe.build>' })) {
  const e = fixtureEnv();
  e.API_ORIGIN = API;
  e.EMAIL_FROM = 'Learn Vibe Build <hello@learnvibe.build>';
  e.sent = [];
  e.EMAIL = { send: async (m) => { e.sent.push(m); return send(m); } };
  return e;
}
const sql = (e, q, ...a) => e.DB.prepare(q).bind(...a);

const mint = (e, tok, body = { student_id: 1 }) => worker.fetch(new Request(`${API}/instructor/signin-link`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(tok ? { Cookie: `lvb_session=${tok}` } : {}) },
  body: JSON.stringify(body),
}), e);
const consume = (e, token) => worker.fetch(new Request(`${API}/auth/callback`, {
  method: 'POST', body: new URLSearchParams({ token }),
}), e);
const requestEmail = (e, email) => worker.fetch(new Request(`${API}/auth/request`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
}), e);
const studentPage = async (e, id) => (await worker.fetch(new Request(`${API}/instructor/student?id=${id}`, {
  headers: { Cookie: `lvb_session=${TOKENS.prof}` },
}), e)).json();

// Capture console output so a test can prove what is (not) logged.
async function captureLogs(fn) {
  const lines = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try { await fn(); } finally { Object.assign(console, orig); }
  return lines.join('\n');
}

test('signed out gets 401 and a student 403 (even for themselves); nothing is minted', async () => {
  const e = env();
  assert.equal((await mint(e, null)).status, 401);
  assert.equal((await mint(e, TOKENS.one, { student_id: 1 })).status, 403);
  assert.equal((await mint(e, TOKENS.two, { student_id: 1 })).status, 403);
  const n = await sql(e, 'SELECT COUNT(*) AS n FROM magic_tokens').first();
  assert.equal(n.n, 0);
});

test('the instructor gets a 30-minute link that signs the student in once', async () => {
  const e = env();
  const res = await mint(e, TOKENS.prof, { student_id: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const d = await res.json();
  const minutes = (Date.parse(d.expires_at) - Date.parse(d.created_at)) / 60000;
  assert.equal(minutes, 30);
  const token = new URL(d.link).searchParams.get('token');
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(e.sent.length, 0, 'an in-person link is never emailed');

  const page = await worker.fetch(new Request(d.link), e);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /expires 30 minutes after it was made/);

  const first = await consume(e, token);
  assert.equal(first.status, 302);
  assert.equal(first.headers.get('Location'), 'https://cu.learnvibe.build/account/');
  const cookie = first.headers.get('Set-Cookie').match(/lvb_session=([0-9a-f]+)/)[1];
  const me = await worker.fetch(new Request(`${API}/me`, { headers: { Cookie: `lvb_session=${cookie}` } }), e);
  assert.equal((await me.json()).email, 'e2e-test@learnvibe.build', 'the session is the student\'s');

  const second = await consume(e, token);
  assert.equal(second.status, 302);
  assert.match(second.headers.get('Location'), /#error=expired$/);
  assert.equal(second.headers.get('Set-Cookie'), null);

  const row = await sql(e, 'SELECT token_hash, sent_to, send_status FROM magic_tokens').first();
  assert.notEqual(row.token_hash, token, 'only the hash is stored');
  assert.deepEqual([row.sent_to, row.send_status], ['in_person', 'shown to instructor']);
});

test('no links for the instructor row, unknown ids or junk', async () => {
  const e = env();
  assert.equal((await mint(e, TOKENS.prof, { student_id: 9 })).status, 404);
  assert.equal((await mint(e, TOKENS.prof, { student_id: 999 })).status, 404);
  assert.equal((await mint(e, TOKENS.prof, { student_id: '1 OR 1=1' })).status, 400);
  assert.equal((await mint(e, TOKENS.prof, {})).status, 400);
});

test('in-person links do not use up the student\'s emailed-link rate limit', async () => {
  const e = env();
  for (let i = 0; i < 3; i++) assert.equal((await mint(e, TOKENS.prof, { student_id: 1 })).status, 200);
  for (let i = 0; i < 3; i++) assert.equal((await requestEmail(e, 'e2e-test@learnvibe.build')).status, 200);
  assert.equal((await requestEmail(e, 'e2e-test@learnvibe.build')).status, 429);
});

test('an emailed link records sent + message id; the log has no address, link or token', async () => {
  const e = env();
  await sql(e, "UPDATE students SET login_alias = 'one-alias@school.example' WHERE id = 1").run();
  const logs = await captureLogs(async () => {
    assert.equal((await requestEmail(e, 'e2e-test@learnvibe.build')).status, 200);
    assert.equal((await requestEmail(e, 'ONE-alias@school.example')).status, 200);
  });
  const rows = (await sql(e, 'SELECT sent_to, send_status, send_message_id FROM magic_tokens ORDER BY created_at, rowid').all()).results;
  assert.deepEqual(rows.map((r) => [r.sent_to, r.send_status, r.send_message_id]), [
    ['email', 'sent', '<msg-1@learnvibe.build>'],
    ['alias', 'sent', '<msg-1@learnvibe.build>'],
  ]);
  assert.match(logs, /"event":"magic_email","student_id":1,"sent_to":"alias","to_domain":"school.example","ok":true/);
  const token = new URL(e.sent[0].text.match(/https:\S+/)[0]).searchParams.get('token');
  for (const secret of [token, 'e2e-test@', 'one-alias@', '/auth/callback']) assert.ok(!logs.includes(secret), `logged ${secret}`);
});

test('a failed send records the reason without the address or link, and still 502s', async () => {
  const e = env(async (m) => {
    const token = m.text.match(/token=([0-9a-f]+)/)[1];
    const err = new Error(`recipient ${m.to} rejected for ${m.text.match(/https:\S+/)[0]} (body ${token})`);
    err.code = 'E_RECIPIENT_SUPPRESSED';
    throw err;
  });
  const logs = await captureLogs(async () => {
    assert.equal((await requestEmail(e, 'e2e-test@learnvibe.build')).status, 502);
  });
  const row = await sql(e, 'SELECT send_status FROM magic_tokens').first();
  assert.equal(row.send_status, 'failed: E_RECIPIENT_SUPPRESSED: recipient <address> rejected for <url> (body <hex>)');
  assert.match(logs, /"ok":false,"error":"E_RECIPIENT_SUPPRESSED/);
  assert.ok(!logs.includes('e2e-test@') && !logs.includes('token='));
});

test('the student page lists recent sign-in attempts, newest first, only theirs', async () => {
  const e = env();
  await requestEmail(e, 'e2e-test@learnvibe.build');
  await requestEmail(e, 'e2e-test-2@learnvibe.build');
  await mint(e, TOKENS.prof, { student_id: 1 });
  const d = await studentPage(e, 1);
  assert.deepEqual(d.signin_attempts.map((a) => [a.sent_to, a.send_status, a.used_at]), [
    ['in_person', 'shown to instructor', null],
    ['email', 'sent', null],
  ]);
  assert.ok(!JSON.stringify(d.signin_attempts).includes('token'), 'no token or hash in the payload');
});

test('a new in-person link ends the earlier unused one; JSON only', async () => {
  const e = env();
  const first = await (await mint(e, TOKENS.prof, { student_id: 1 })).json();
  const second = await (await mint(e, TOKENS.prof, { student_id: 1 })).json();
  const t = (d) => new URL(d.link).searchParams.get('token');
  assert.match((await consume(e, t(first))).headers.get('Location'), /#error=expired$/, 'the first link no longer works');
  assert.equal((await consume(e, t(second))).headers.get('Location'), 'https://cu.learnvibe.build/account/');
  const form = await worker.fetch(new Request(`${API}/instructor/signin-link`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: `lvb_session=${TOKENS.prof}` }, body: '{"student_id":1}',
  }), e);
  assert.equal(form.status, 415);
});
