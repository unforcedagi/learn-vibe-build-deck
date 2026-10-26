// End-to-end check of "Copy my final project prompt" in a real headless
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

async function copied(page, label) {
  await page.getByRole('button', { name: label }).click();
  await page.getByText('Copied ✓').waitFor();
  return page.evaluate(() => navigator.clipboard.readText());
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
    await shot(page, `03-journey-signed-in-${tag}.png`, '.journey-top');
    await page.context().close();

    page = await newPage(browser, { width: w, height: h });
    await page.goto('https://cu.learnvibe.build/account/journey/');
    const jGen = await copied(page, 'Copy the generic prompt');
    const jText = await page.locator('.journey-fp').innerText();
    check(`${tag}: My journey signed out copies the generic prompt and points to the sign-in box`, () => {
      assert.equal(jGen, gen);
      assert.ok(jText.includes('Sign in above'));
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
