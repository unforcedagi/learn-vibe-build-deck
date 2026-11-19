// End-to-end check of "Copy my final project prompt" (Week 9, My journey) and
// "Start your final reflection" (My journey) in a real headless
// browser, with no production data: the site is served from this checkout at
// its real origin, and api.learnvibe.build is answered in-process by the real
// Worker code over the fixture class in worker/test/fixtures (throwaway e2e
// accounts only). Each signed-in account copies its prompt; the script checks
// the clipboard holds its own fixture work and links and none of the other's.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e_fp_prompt.mjs [shots-dir]
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

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/markdown',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const env = fixtureEnv();

async function newPage(browser, { token, width, height, oldWorker = false }) {
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
      // oldWorker: the site is live but the Worker isn't redeployed yet.
      if (oldWorker && url.pathname === '/me/final-project-prompt') {
        return route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': 'https://cu.learnvibe.build', 'Access-Control-Allow-Credentials': 'true' }, body: '{"error":"not_found"}' });
      }
      // The browser decides which cookies ride along; the Worker sees exactly that.
      const headers = await req.allHeaders();
      const res = await worker.fetch(new Request(url, { method: req.method(), headers, body: req.postData() || undefined }), env);
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    return route.abort();
  });
  return ctx.newPage();
}

const results = [];
const check = (name, fn) => { fn(); results.push(name); console.log('ok -', name); };

// The first button with this label; My journey has two prompt boxes, each with its own status line.
async function copied(page, label) {
  const btn = page.getByRole('button', { name: label }).first();
  await btn.click();
  await btn.locator('xpath=..').getByText('Copied ✓').waitFor();
  return btn.page().evaluate(() => navigator.clipboard.readText());
}

async function shot(page, name, selector) {
  if (!shots) return;
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'start' }), selector);
  await page.evaluate(() => window.scrollBy(0, -16));
  await page.screenshot({ path: path.join(shots, name) });
}

const browser = await chromium.launch();
try {
  for (const [w, h, tag] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
    // Signed in as e2e account one, on Week 9.
    let page = await newPage(browser, { token: TOKENS.one, width: w, height: h });
    await page.goto('https://cu.learnvibe.build/lessons/week-9/');
    await page.getByRole('button', { name: 'Copy my final project prompt' }).waitFor();
    const one = await copied(page, 'Copy my final project prompt');
    check(`${tag}: account one's copied prompt has its own work and links, nothing of account two`, () => {
      for (const s of ['ONE-W1', 'ONE-W4', 'ONE-W6', 'ONE-POST', 'ONE-PODPOST', 'https://one.example/sketch',
        'https://one.example/tides', 'https://one.example/demo', 'https://one.example/pod-q', '=== MY SEMESTER SO FAR ===']) {
        assert.ok(one.includes(s), `missing ${s}`);
      }
      assert.ok(!/TWO-|two\.example/.test(one), 'account two leaked into account one');
    });
    const sizeShown = await page.getByText(`${one.length.toLocaleString('en-US')} characters. Paste this into Claude, ChatGPT or any AI you use.`).isVisible();
    check(`${tag}: the page shows the prompt's length and the paste note`, () => assert.ok(sizeShown));
    await shot(page, `01-week9-signed-in-${tag}.png`, '[id="3-your-final-project-prompt"]');
    await page.context().close();

    // Signed in as e2e account two.
    page = await newPage(browser, { token: TOKENS.two, width: w, height: h });
    await page.goto('https://cu.learnvibe.build/lessons/week-9/');
    const two = await copied(page, 'Copy my final project prompt');
    check(`${tag}: account two's copied prompt has its own work, nothing of account one`, () => {
      assert.ok(two.includes('TWO-W2') && two.includes('https://two.example/recipes') && two.includes('https://two.example/demo'));
      assert.ok(!/ONE-|one\.example/.test(two), 'account one leaked into account two');
    });
    await page.context().close();

    // Signed out on Week 9: sign-in link plus the generic prompt.
    page = await newPage(browser, { width: w, height: h });
    await page.goto('https://cu.learnvibe.build/lessons/week-9/');
    await page.getByRole('button', { name: 'Copy the generic prompt' }).waitFor();
    const gen = await copied(page, 'Copy the generic prompt');
    const signIn = await page.locator('.fp-signin a').getAttribute('href');
    check(`${tag}: signed out gets a sign-in link and the generic prompt with the paste slot`, () => {
      assert.equal(signIn, 'https://cu.learnvibe.build/account/');
      assert.ok(gen.includes('[PASTE YOUR EARLIER SUBMISSIONS AND PROJECT LINKS HERE]'));
      assert.ok(!/ONE-|TWO-|\.example\//.test(gen));
    });
    await shot(page, `02-week9-signed-out-${tag}.png`, '[id="3-your-final-project-prompt"]');
    await page.context().close();

    // My journey, signed in (one) and signed out.
    page = await newPage(browser, { token: TOKENS.one, width: w, height: h });
    await page.goto('https://cu.learnvibe.build/account/journey/');
    const j = await copied(page, 'Copy my final project prompt');
    check(`${tag}: My journey copies the same personal prompt`, () => assert.equal(j, one));
    const r = await copied(page, 'Copy my reflection prompt');
    const rBox = await page.locator('.journey-reflection').textContent();
    check(`${tag}: My journey copies the reflection prompt, Week 1 first as the baseline, own work only`, () => {
      const order = ['## Week 1: where I started (my baseline)', 'ONE-W1', 'ONE-W4', 'ONE-W6', 'ONE-POST'];
      const at = order.map((s) => r.indexOf(s));
      assert.ok(at.every((i, n) => i >= 0 && (n === 0 || i > at[n - 1])), `order ${at}`);
      assert.ok(r.includes('Wednesday, December 9 at 11:59 PM') && r.includes("Don't write it or draft any of it for me"));
      assert.ok(!/TWO-|two\.example/.test(r), 'account two leaked into account one');
      assert.ok(rBox.includes('Start your final reflection') && rBox.includes('starting from your Week 1 intention'));
    });
    await shot(page, `03-journey-signed-in-${tag}.png`, '.journey-top');
    if (shots && tag === 'desktop') {
      await page.locator('.journey-reflection summary').click();
      await page.evaluate(() => { const pre = document.querySelector('.journey-reflection .fp-preview'); pre.scrollTop = pre.scrollHeight * 0.18; });
      await shot(page, `06-journey-reflection-prompt-open-${tag}.png`, '.journey-reflection .fp-fold');
    }
    await page.context().close();

    // The instructor's view-as of account one shows the same reflection prompt.
    page = await newPage(browser, { token: TOKENS.prof, width: w, height: h });
    await page.goto('https://cu.learnvibe.build/account/journey/?as=1');
    const rAs = await copied(page, 'Copy my reflection prompt');
    check(`${tag}: instructor view-as copies the student's own reflection prompt`, () => assert.equal(rAs, r));
    await shot(page, `05-journey-view-as-${tag}.png`, '.journey-reflection');
    await page.context().close();

    page = await newPage(browser, { width: w, height: h });
    await page.goto('https://cu.learnvibe.build/account/journey/');
    const jGen = await copied(page, 'Copy the generic prompt');
    const jText = await page.locator('.journey-fp').first().innerText();
    const rText = await page.locator('.journey-reflection').textContent();
    const rGen = await copied(page.locator('.journey-reflection'), 'Copy the generic prompt');
    check(`${tag}: My journey signed out copies the generic prompts and points to the sign-in box`, () => {
      assert.equal(jGen, gen);
      assert.ok(jText.includes('Sign in above') && rText.includes('Sign in above'));
      assert.ok(rText.includes('Start your final reflection'));
      assert.ok(rGen.includes('[PASTE YOUR WEEK 1 INTENTION FIRST') && !/ONE-|TWO-|\.example\//.test(rGen));
    });
    await shot(page, `04-journey-signed-out-${tag}.png`, '.board-signin');
    await page.context().close();
  }
  // Merged before the Worker deploy: a signed-in student still gets the generic prompt, no sign-in nag.
  const page = await newPage(browser, { token: TOKENS.one, width: 1280, height: 900, oldWorker: true });
  await page.goto('https://cu.learnvibe.build/lessons/week-9/');
  const g = await copied(page, 'Copy the generic prompt');
  const box = await page.locator('.fp-prompt').innerText();
  check('before the Worker deploy: generic prompt with a "couldn\'t load" note, no sign-in link', () => {
    assert.ok(g.includes('[PASTE YOUR EARLIER SUBMISSIONS AND PROJECT LINKS HERE]'));
    assert.ok(box.includes("couldn't load") && !box.includes('Sign in'));
  });
  await page.context().close();
} finally {
  await browser.close();
}
console.log(`${results.length} checks passed`);
