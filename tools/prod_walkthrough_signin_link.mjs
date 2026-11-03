// Screenshots of the instructor's "Make a sign-in link" button on the live
// site, driven as a person would, with the throwaway accounts from
// tools/prod_e2e_signin_link.py seed (never a real student's page).
//
//   python3 tools/prod_e2e_signin_link.py seed <workdir>
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/prod_walkthrough_signin_link.mjs <workdir>/tokens.json <shots-dir>
//   python3 tools/prod_e2e_signin_link.py clean <workdir>
//
// The link it makes is used up in the same run, and clean deletes its row.
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const { tokens, student_id: sid } = JSON.parse(await readFile(process.argv[2], 'utf8'));
const shots = path.resolve(process.argv[3]);
await mkdir(shots, { recursive: true });

const SITE = 'https://cu.learnvibe.build';
const check = (name, ok) => { assert.ok(ok, name); console.log('ok -', name); };
const shot = (page, name) => page.screenshot({ path: path.join(shots, name) });

async function newPage(browser, { token, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  if (token) {
    await ctx.addCookies([{ name: 'lvb_session', value: token, domain: '.learnvibe.build', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  }
  return ctx.newPage();
}

const browser = await chromium.launch();
try {
  let page = await newPage(browser, { token: tokens.prof, width: 1280, height: 860 });
  await page.goto(`${SITE}/instructor/student/?id=${sid}`);
  await page.locator('#main:not(.hidden)').waitFor();
  await page.locator('#s-signin').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  check('the live page shows the Sign-in card', await page.locator('#s-mint').isVisible());
  await shot(page, '01-signin-card.png');

  await page.getByRole('button', { name: 'Make a sign-in link' }).click();
  await page.locator('#s-link:not(.hidden)').waitFor();
  const link = await page.locator('#s-link-text').inputValue();
  check('a link is shown', link.startsWith('https://api.learnvibe.build/auth/callback?token='));
  await page.getByRole('button', { name: 'Copy' }).click();
  check('Copy puts it on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === link);
  await shot(page, '02-link-made.png');
  await page.context().close();

  page = await newPage(browser, { token: null, width: 390, height: 844 });
  await page.goto(link);
  await shot(page, '03-student-opens-link.png');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${SITE}/account/`);
  await page.waitForTimeout(1500);
  check('the student lands signed in on their account page', (await page.content()).includes('E2E Student'));
  await shot(page, '04-student-signed-in.png');
  await page.context().close();

  page = await newPage(browser, { token: null, width: 390, height: 844 });
  await page.goto(link);
  await page.getByText('That sign-in link expired or was already used').waitFor();
  check('a second use is refused', true);
  await shot(page, '05-second-use-refused.png');
  await page.context().close();

  page = await newPage(browser, { token: tokens.prof, width: 1280, height: 860 });
  await page.goto(`${SITE}/instructor/student/?id=${sid}`);
  await page.locator('#main:not(.hidden)').waitFor();
  await page.locator('#s-attempts').scrollIntoViewIfNeeded();
  check('the instructor sees it used', (await page.locator('#s-attempts tbody tr').first().textContent()).includes('used '));
  await shot(page, '06-link-used.png');
  await page.context().close();
} finally {
  await browser.close();
}
console.log('all checks passed');
