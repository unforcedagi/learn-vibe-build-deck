// End-to-end check of the instructor student page in a real headless browser,
// with no production data: the site is served from this checkout at its real
// origin, and api.learnvibe.build is answered in-process by the real Worker
// code over the fixture class in worker/test/fixtures (throwaway e2e accounts
// only). The instructor opens a student from the roster; a student is refused.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e_student_page.mjs [shots-dir]
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

async function newPage(browser, { token, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1 });
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

const browser = await chromium.launch();
try {
  // Instructor: roster -> student page.
  let page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/');
  await page.locator('#main').waitFor();
  const link = page.locator('a.open-student').first();
  await link.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -200));
  await shot(page, '01-roster-link.png');
  await page.getByRole('row', { name: /E2E One/ }).getByRole('link', { name: 'Student page →' }).click();
  await page.waitForURL(/\/instructor\/student\/\?id=1$/);
  await page.locator('#main:not(.hidden)').waitFor();
  check('instructor sees the student page with their name', (await page.locator('#s-name').textContent()) === 'E2E One');
  check('header shows the pod', (await page.locator('#s-meta').textContent()).includes('Pod Tide'));
  check('strip marks week 1 on time and week 2 missing',
    (await page.locator('#s-strip .wg').nth(0).getAttribute('class')).includes('on_time') &&
    (await page.locator('#s-strip .wg').nth(1).getAttribute('class')).includes('missing'));
  const read = await page.locator('#s-read').textContent();
  check('AI read is theirs, with its updated time and basis', read.includes('ONE-READ') && read.includes('based on weeks 1, 4, 6 and 2 board posts'));
  const body = await page.locator('#main').textContent();
  check('timeline has their weeks and posts', ['ONE-W1', 'ONE-W4', 'ONE-W6', 'ONE-POST body', 'to Pod Tide'].every((s) => body.includes(s)));
  check('nothing of the other student leaks', !/TWO-|two\.example/.test(body));
  check('view-as link goes to their My journey', (await page.locator('#s-journey').getAttribute('href')) === '../../account/journey/?as=1');
  await shot(page, '02-student-header-and-read.png');
  await page.locator('#s-subs').scrollIntoViewIfNeeded();
  await shot(page, '03-student-timeline.png');
  await page.context().close();

  // A late week and a collapsed attachment (student two).
  page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/student/?id=2');
  await page.locator('#main:not(.hidden)').waitFor();
  check('late week badged', (await page.locator('#week-3 .badge.late').count()) === 1);
  const det = page.locator('#week-3 details.attachment');
  check('attachment text starts collapsed', (await det.count()) === 1 && !(await det.evaluate((d) => d.open)));
  await det.locator('summary').click();
  check('attachment opens to its extracted text', (await det.textContent()).includes('TWO-ATTACHMENT'));
  await det.scrollIntoViewIfNeeded();
  await shot(page, '04-late-week-attachment.png');
  await page.context().close();

  // A student, even for their own id, is refused.
  page = await newPage(browser, { token: TOKENS.one, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/student/?id=1');
  await page.locator('#denied:not(.hidden)').waitFor();
  check('student sees "This page is for Aaron" and no data', !(await page.locator('#main').isVisible()) &&
    !(await page.content()).includes('ONE-READ'));
  await shot(page, '05-student-denied.png');
  await page.context().close();

  // Phone width.
  page = await newPage(browser, { token: TOKENS.prof, width: 390, height: 844 });
  await page.goto('https://cu.learnvibe.build/instructor/student/?id=1');
  await page.locator('#main:not(.hidden)').waitFor();
  await shot(page, '06-phone.png');
  await page.context().close();
} finally {
  await browser.close();
}
console.log('all checks passed');
