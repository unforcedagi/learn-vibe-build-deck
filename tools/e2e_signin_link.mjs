// End-to-end check of the instructor's "Make a sign-in link" button in a real
// headless browser, with no production data: the site is served from this
// checkout at its real origin, and api.learnvibe.build is answered in-process
// by the real Worker code over the fixture class in worker/test/fixtures
// (throwaway e2e accounts only; the Email Service is faked). The instructor
// sees the student's past attempts, makes a link and copies it; the student
// opens it signed out, signs in once, and a second use is refused.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e_signin_link.mjs [shots-dir]
//
// Exits non-zero on any failed check. With a shots-dir it saves screenshots.
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const worker = (await import(path.join(root, 'worker/src/index.js'))).default;
const { fixtureEnv, TOKENS } = await import(path.join(root, 'worker/test/fixtures/fp-prompt-fixture.mjs'));
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shots) await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const env = fixtureEnv();
env.API_ORIGIN = 'https://api.learnvibe.build';
env.EMAIL_FROM = 'Learn Vibe Build <hello@learnvibe.build>';
let sends = 0;
env.EMAIL = { send: async () => { sends += 1; if (sends === 2) { const e = new Error('daily limit'); e.code = 'E_RATE_LIMIT'; throw e; } return { messageId: `<e2e-${sends}@learnvibe.build>` }; } };

async function newPage(browser, { token, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://cu.learnvibe.build' });
  if (token) {
    await ctx.addCookies([{ name: 'lvb_session', value: token, domain: '.learnvibe.build', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  }
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.host === 'cu.learnvibe.build') {
      let file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root)) return route.fulfill({ status: 403 });
      if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
      try {
        return route.fulfill({ status: 200, body: await readFile(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
      } catch { return route.fulfill({ status: 404, body: 'not found' }); }
    }
    if (url.host === 'api.learnvibe.build') {
      const headers = await req.allHeaders();
      const res = await worker.fetch(new Request(url, { method: req.method(), headers, body: req.postData() || undefined }), env);
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    if (url.host === 'cdn.jsdelivr.net') return route.continue(); // marked + DOMPurify
    return route.abort();
  });
  return ctx.newPage();
}

const check = (name, ok) => { assert.ok(ok, name); console.log('ok -', name); };
const shot = async (page, name, opts = {}) => shots && page.screenshot({ path: path.join(shots, name), ...opts });
const api = (p, init) => worker.fetch(new Request(`https://api.learnvibe.build${p}`, init), env);

// History: one emailed link that went out, one the Email Service refused.
for (let i = 0; i < 2; i++) {
  await api('/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'e2e-test@learnvibe.build' }) });
}

const browser = await chromium.launch();
try {
  // Instructor: the student's page shows the attempts, then makes a link.
  let page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/student/?id=1');
  await page.locator('#main:not(.hidden)').waitFor();
  const rows = page.locator('#s-attempts tbody tr');
  check('two past attempts listed, newest first', (await rows.count()) === 2 &&
    (await rows.nth(0).textContent()).includes('failed: E_RATE_LIMIT: daily limit') &&
    (await rows.nth(1).textContent()).includes('sent'));
  await page.locator('#s-signin').scrollIntoViewIfNeeded();
  await shot(page, '01-signin-attempts.png');

  await page.getByRole('button', { name: 'Make a sign-in link' }).click();
  await page.locator('#s-link:not(.hidden)').waitFor();
  const link = await page.locator('#s-link-text').inputValue();
  check('a one-time link is shown', /^https:\/\/api\.learnvibe\.build\/auth\/callback\?token=[0-9a-f]{64}$/.test(link));
  check('the note says once, until when, for whom', /Works once, until .*Only for E2E One\./.test(await page.locator('#s-link-note').textContent()));
  check('the new link heads the attempts as "made here"', (await rows.count()) === 3 &&
    (await rows.nth(0).textContent()).includes('made here'));
  await page.getByRole('button', { name: 'Copy' }).click();
  check('Copy puts the link on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === link);
  check('nothing was emailed for it', sends === 2);
  await shot(page, '02-link-made.png');
  await page.context().close();

  // The student, signed out, opens the link and signs in once.
  page = await newPage(browser, { token: null, width: 390, height: 844 });
  await page.goto(link);
  check('the link opens the Sign in page (30 minutes)', (await page.locator('main p').textContent()).includes('expires 30 minutes'));
  await shot(page, '03-student-opens-link.png');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('https://cu.learnvibe.build/account/');
  const cookies = await page.context().cookies('https://api.learnvibe.build');
  check('the student now has a session', cookies.some((c) => c.name === 'lvb_session'));
  const me = await api('/me', { headers: { Cookie: `lvb_session=${cookies.find((c) => c.name === 'lvb_session').value}` } });
  check('the session is E2E One\'s', (await me.json()).email === 'e2e-test@learnvibe.build');
  await page.waitForTimeout(800);
  await shot(page, '04-student-signed-in.png');
  await page.context().close();

  // Second use: refused.
  page = await newPage(browser, { token: null, width: 390, height: 844 });
  await page.goto(link);
  await page.getByText('That sign-in link expired or was already used').waitFor();
  check('a second use is refused ("expired or was already used")', !(await page.context().cookies('https://api.learnvibe.build')).length);
  await shot(page, '05-second-use-refused.png');
  await page.context().close();

  // The instructor page now shows it used.
  page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/student/?id=1');
  await page.locator('#main:not(.hidden)').waitFor();
  check('the made link shows as used', (await page.locator('#s-attempts tbody tr').nth(0).textContent()).includes('used '));
  await page.locator('#s-signin').scrollIntoViewIfNeeded();
  await shot(page, '06-link-used.png');
  await page.context().close();

  // A student can't make links.
  page = await newPage(browser, { token: TOKENS.one, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/student/?id=1');
  await page.locator('#denied:not(.hidden)').waitFor();
  const res = await page.evaluate(async () => (await fetch('https://api.learnvibe.build/instructor/signin-link', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{"student_id":1}',
  })).status);
  check('a student gets 403 from the mint endpoint', res === 403);
  await page.context().close();
} finally {
  await browser.close();
}
console.log('all checks passed');
