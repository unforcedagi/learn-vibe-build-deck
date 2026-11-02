// End-to-end check of the gift video on /account/ and in the instructor view, in a real
// browser (Playwright Chromium; set CHROMIUM to use another), with no real student data. The site is
// served from this checkout at its real origin; api.learnvibe.build is answered in-process
// by the real Worker over the fixture class, with a test video for E2E One only.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e_gift.mjs <test.mp4> [shots-dir]
//
// Against prod instead (after `tools/prod_e2e_gift.py seed <workdir> <test.mp4>`):
//   ... node tools/e2e_gift.mjs <test.mp4> [shots-dir] --prod <workdir>/tokens.json
//
// Exits non-zero on any failed check. With a shots-dir it saves screenshots.
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const args = process.argv.slice(2);
const prodIdx = args.indexOf('--prod');
const prod = prodIdx >= 0 ? JSON.parse(await readFile(args[prodIdx + 1], 'utf8')) : null;
const plain = args.filter((a, i) => !a.startsWith('--') && !(prodIdx >= 0 && i === prodIdx + 1));
const video = await readFile(path.resolve(plain[0]));
const shots = plain[1] ? path.resolve(plain[1]) : null;
if (shots) await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

// tokens: owner (has the video), other (a classmate), prof (instructor); ownerId: the owner's students.id.
let env = null;
let TOKENS;
let ownerId;
if (prod) {
  ({ tokens: TOKENS, owner_id: ownerId } = prod);
} else {
  const worker = (await import(path.join(root, 'worker/src/index.js'))).default;
  const fx = await import(path.join(root, 'worker/test/fixtures/fp-prompt-fixture.mjs'));
  TOKENS = { owner: fx.TOKENS.one, other: fx.TOKENS.two, prof: fx.TOKENS.prof };
  ownerId = 1;
  const objects = new Map([['gift/1.mp4', new Uint8Array(video)]]);
  env = fx.fixtureEnv();
  env.GIFTS = {
    async get(key, opts) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      const r = opts?.range;
      let start = 0, len = bytes.length;
      if (r) {
        if (r.suffix !== undefined) { start = bytes.length - r.suffix; len = r.suffix; }
        else { start = r.offset; len = r.length ?? bytes.length - r.offset; }
      }
      return { size: bytes.length, range: r, body: bytes.slice(start, start + len) };
    },
    async head(key) { return objects.has(key) ? { size: objects.get(key).length } : null; },
    async list({ prefix }) {
      return { objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
  };
  env.worker = worker;
}

async function newPage(browser, { token, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1 });
  if (token) {
    await ctx.addCookies([{ name: 'lvb_session', value: token, domain: '.learnvibe.build', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  }
  if (prod) return ctx.newPage();
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
      const res = await env.worker.fetch(new Request(url, { method: req.method(), headers, body: req.postData() || undefined }), env);
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    if (url.host === 'cdn.jsdelivr.net') return route.continue(); // marked + DOMPurify
    return route.abort();
  });
  return ctx.newPage();
}

const check = (name, ok) => { assert.ok(ok, name); console.log('ok -', name); };
const shot = async (page, name, opts = {}) => shots && page.screenshot({ path: path.join(shots, name), ...opts });
const API = 'https://api.learnvibe.build';
const giftUrl = `${API}/gift/${ownerId}`;

// Status of a fetch made from inside the page, with the page's cookies.
const statusFrom = (page, url, headers = {}) => page.evaluate(async ([u, h]) => {
  const r = await fetch(u, { credentials: 'include', headers: h });
  return { status: r.status, range: r.headers.get('Content-Range'), type: r.headers.get('Content-Type') };
}, [url, headers]);

// The API straight from Node: the in-process Worker locally, the real one with --prod.
const apiFetch = (url, token, headers = {}) => {
  const init = { headers: { ...(token ? { Cookie: `lvb_session=${token}` } : {}), ...headers } };
  return prod ? fetch(url, init) : env.worker.fetch(new Request(url, init), env);
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  // The owner: the video is on /account/, plays, and seeks.
  let page = await newPage(browser, { token: TOKENS.owner, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/account/');
  await page.locator('#account:not(.hidden)').waitFor();
  const gift = page.locator('#gift');
  await gift.waitFor();
  check('the warm line sits above the video',
    (await gift.locator('.gift-line').textContent()).startsWith('A gift from Aaron: a one-minute film made from what you’ve built this semester.'));
  const v = gift.locator('video');
  check('the video points at their own /gift/<id>', (await v.getAttribute('src')) === giftUrl);
  await page.waitForFunction(() => document.querySelector('#gift video').readyState >= 1, null, { timeout: 30000 });
  const duration = await v.evaluate((n) => n.duration);
  check(`metadata loaded (duration ${duration.toFixed(1)} s)`, duration > 5);
  await shot(page, '01-account-gift.png');
  const range = await statusFrom(page, giftUrl, { Range: 'bytes=1000-1999' });
  check(`a range request from the page answers 206 (${range.status})`, range.status === 206 && range.type === 'video/mp4');
  // Content-Range isn't exposed to a cross-origin fetch, so read it outside the browser.
  const direct = await apiFetch(giftUrl, TOKENS.owner, { Range: 'bytes=1000-1999' });
  check(`and says which bytes (${direct.headers.get('Content-Range')})`,
    direct.status === 206 && new RegExp(`^bytes 1000-1999/${video.length}$`).test(direct.headers.get('Content-Range')));
  await v.evaluate((n) => { n.muted = true; return n.play(); });
  await page.waitForFunction(() => document.querySelector('#gift video').currentTime > 0.5, null, { timeout: 20000 });
  check('it plays', true);
  const target = Math.min(duration - 2, duration * 0.75);
  await v.evaluate((n, t) => new Promise((ok) => { n.addEventListener('seeked', ok, { once: true }); n.currentTime = t; }), target);
  const after = await v.evaluate((n) => n.currentTime);
  check(`it seeks (to ${after.toFixed(1)} s)`, Math.abs(after - target) < 1.5);
  await v.evaluate((n) => n.pause());
  await shot(page, '02-account-gift-seeked.png');
  await page.context().close();

  // Phone width: the video fits.
  page = await newPage(browser, { token: TOKENS.owner, width: 390, height: 844 });
  await page.goto('https://cu.learnvibe.build/account/');
  await page.locator('#gift video').waitFor();
  check('phone: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.waitForFunction(() => document.querySelector('#gift video').readyState >= 1, null, { timeout: 30000 });
  await shot(page, '03-phone-gift.png');
  await page.context().close();

  // A classmate: no gift box, and the owner's video is refused.
  page = await newPage(browser, { token: TOKENS.other, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/account/');
  await page.locator('#account:not(.hidden)').waitFor();
  await page.locator('#week-tabs a, #week-tabs button').first().waitFor();
  check('a student without a video sees no gift box', (await page.locator('#gift').count()) === 0);
  const other = await statusFrom(page, giftUrl, { Range: 'bytes=0-99' });
  check(`a classmate gets 403 for it (${other.status})`, other.status === 403);
  await page.context().close();

  // Signed out.
  page = await newPage(browser, { token: null, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/account/');
  const anon = await statusFrom(page, giftUrl);
  check(`signed out gets 401 (${anon.status})`, anon.status === 401);
  await page.context().close();

  // The instructor: a link on the roster row, the video on the student page.
  page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/');
  await page.locator('#main:not(.hidden)').waitFor();
  const links = page.locator('tr.student a', { hasText: 'Gift video' });
  await links.first().waitFor();
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.href));
  check('the roster links the gift video on its student\'s row', hrefs.includes(giftUrl));
  if (!prod) check('only students with a video get the link', hrefs.length === 1);
  const prof = await statusFrom(page, giftUrl, { Range: 'bytes=0-99' });
  check(`the instructor can fetch it (${prof.status})`, prof.status === 206);
  await page.goto(`https://cu.learnvibe.build/instructor/student/?id=${ownerId}`);
  await page.locator('#main:not(.hidden)').waitFor();
  await page.locator('#s-gift video').waitFor();
  check('the student page shows the video', (await page.locator('#s-gift video').getAttribute('src')) === giftUrl);
  check('right under the page header, above the AI read', await page.evaluate(() =>
    document.querySelector('#main .page-head').nextElementSibling === document.getElementById('s-gift')));
  await page.waitForFunction(() => document.querySelector('#s-gift video').readyState >= 1, null, { timeout: 30000 });
  await shot(page, '04-instructor-student-gift.png');
  await page.context().close();
} finally {
  await browser.close();
}
console.log('all checks passed');
