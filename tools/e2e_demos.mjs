// End-to-end check of the final demo sign-up in a real browser (Playwright
// Chromium; set CHROMIUM to use another). No real student data.
//
// Locally the site is served from this checkout at its real origin and
// api.learnvibe.build is answered in-process by the real Worker over the
// fixture class, plus a few invented classmates so the lists look lived in:
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e_demos.mjs [shots-dir]
//
// Against production (after `python3 tools/prod_e2e_demos.py seed <workdir>`),
// with the sign-up still closed: the throwaway accounts are DEMO_PREVIEW
// accounts, so for them the flag is forced on; nobody else sees a thing.
//   ... node tools/e2e_demos.mjs [shots-dir] --prod <workdir>/tokens.json
// It never opens the sign-up in production; it sets and clears a lock.
//
// Desktop (1280) and phone (390, no horizontal scroll). Exits non-zero on any
// failed check; with a shots-dir it saves screenshots.
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const args = process.argv.slice(2);
const prodIdx = args.indexOf('--prod');
const prod = prodIdx >= 0 ? JSON.parse(await readFile(args[prodIdx + 1], 'utf8')) : null;
const plain = args.filter((a, i) => !a.startsWith('--') && !(prodIdx >= 0 && i === prodIdx + 1));
const shots = plain[0] ? path.resolve(plain[0]) : null;
if (shots) await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const SITE = 'https://cu.learnvibe.build';
const API = 'https://api.learnvibe.build';

// tokens: student (preview), other (preview), prof (instructor); outsider: a student not in DEMO_PREVIEW (local only).
let env = null;
let TOKENS;
let firstOf;  // first names as students see them
if (prod) {
  TOKENS = prod.tokens;
  firstOf = { student: 'E2E', other: 'E2E' };
} else {
  const worker = (await import(path.join(root, 'worker/src/index.js'))).default;
  const fx = await import(path.join(root, 'worker/test/fixtures/fp-prompt-fixture.mjs'));
  env = fx.fixtureEnv();
  env.worker = worker;
  const db = env.DB.db;
  // Rename the fixture accounts to invented people, and add invented classmates with slots.
  db.prepare("UPDATE students SET name = 'Maya Okafor' WHERE id = 1").run();
  db.prepare("UPDATE students SET name = 'Theo Brandt' WHERE id = 2").run();
  db.prepare("UPDATE students SET name = 'Sam Rivera' WHERE id = 3").run();
  db.prepare("UPDATE students SET name = 'Aaron (instructor)' WHERE id = 9").run();
  const people = [[21, 'Lena Park', 'Plant-watering reminder that texts you'], [22, 'Jonah Wells', 'A study-group matcher for ATLAS'],
    [23, 'Priya Nair', 'Recipe scaler for dorm kitchens'], [24, 'Diego Castillo', 'Bike-route safety map'],
    [25, 'Ava Chen', 'Mood journal with weekly patterns'], [26, 'Noah Fischer', 'Band practice scheduler']];
  const now = new Date().toISOString();
  people.forEach(([id, name, title], i) => {
    db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, 0)').run(id, String(id), name, `fictional-${id}@example.invalid`);
    const [day, pos] = i < 4 ? ['2026-11-30', [1, 2, 6, 8][i]] : ['2026-12-04', [1, 3][i - 4]];
    db.prepare('INSERT INTO demo_slots (day, position, student_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(day, pos, id, title, now, now);
  });
  for (const [id, name] of [[27, 'Ruby Alvarez'], [28, 'Owen Kim'], [29, 'Isla Moreau']]) {
    db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, 0)').run(id, String(id), name, `fictional-${id}@example.invalid`);
  }
  TOKENS = { student: fx.TOKENS.one, other: fx.TOKENS.two, prof: fx.TOKENS.prof, outsider: fx.TOKENS.empty };
  firstOf = { student: 'Maya', other: 'Theo' };
  assert.equal(db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(createHash('sha256').update(TOKENS.student).digest('hex')) ? 1 : 0, 1);
}

async function newPage(browser, { token, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1 });
  if (token) {
    await ctx.addCookies([{ name: 'lvb_session', value: token, domain: '.learnvibe.build', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  }
  await ctx.addInitScript(() => { window.confirm = () => true; });
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
    if (url.host === 'cdn.jsdelivr.net') return route.continue();
    return route.abort();
  });
  return ctx.newPage();
}

const check = (name, ok) => { assert.ok(ok, name); console.log('ok -', name); };
const shot = async (page, name, opts = {}) => shots && page.screenshot({ path: path.join(shots, name), ...opts });
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const apiFetch = (p, token, init = {}) => {
  const req = { ...init, headers: { ...(init.headers || {}), ...(token ? { Cookie: `lvb_session=${token}` } : {}) } };
  return prod ? fetch(API + p, req) : env.worker.fetch(new Request(API + p, req), env);
};
const DAY1 = '2026-11-30';
const DAY2 = '2026-12-04';
const row = (page, day, pos) => page.locator('.demo-day').nth(day === DAY1 ? 0 : 1).locator('.demo-slot').nth(pos - 1);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  // --- Signed out: nothing linked, the page asks to sign in ------------------
  let page = await newPage(browser, { token: null, width: 1280, height: 900 });
  await page.goto(`${SITE}/`);
  await page.waitForLoadState('networkidle');
  check('signed out: the home page demo card stays hidden', await page.locator('[data-demo-signup]').evaluate((n) => n.classList.contains('hidden')));
  await page.goto(`${SITE}/demos/`);
  await page.locator('#signedout:not(.hidden)').waitFor();
  check('signed out: /demos/ asks to sign in', true);
  check('signed out: GET /demos is 401', (await apiFetch('/demos', null)).status === 401);
  await page.context().close();

  if (!prod) {
    // A student who isn't a preview account, while closed: no card, no list.
    page = await newPage(browser, { token: TOKENS.outsider, width: 1280, height: 900 });
    await page.goto(`${SITE}/`);
    await page.waitForLoadState('networkidle');
    check('closed: a regular student sees no home card', await page.locator('[data-demo-signup]').evaluate((n) => n.classList.contains('hidden')));
    await page.goto(`${SITE}/account/`);
    await page.locator('#account:not(.hidden)').waitFor();
    check('closed: no demo card on their account page', (await page.locator('#demo-signup').count()) === 0);
    await page.goto(`${SITE}/demos/`);
    await page.locator('#closed:not(.hidden)').waitFor();
    check('closed: /demos/ says it isn\'t open yet', (await page.locator('#days .demo-slot').count()) === 0);
    await page.context().close();
  }

  // --- The student (flag forced on for this session): home, account, claim ----
  page = await newPage(browser, { token: TOKENS.student, width: 1280, height: 900 });
  await page.goto(`${SITE}/`);
  await page.locator('[data-demo-signup]:not(.hidden)').waitFor();
  check('preview session: the home This week block links the sign-up', (await page.locator('[data-demo-signup] a').getAttribute('href')) === 'demos/');
  await shot(page, '01-home-card.png', { clip: await page.locator('.week-brief').boundingBox() });
  await page.goto(`${SITE}/account/`);
  await page.locator('#demo-signup').waitFor();
  check('their account page has the demo card', (await page.locator('#demo-signup a').textContent()) === 'Choose your slot');
  await page.locator('#demo-signup a').click();
  await page.locator('#main:not(.hidden)').waitFor();
  check('the page shows the Demo day brief', (await page.locator('.demo-brief h2').textContent()) === 'Demo day');
  check('two days, 13 slots each', (await page.locator('.demo-day').count()) === 2 && (await page.locator('.demo-slot').count()) === 26);
  check('day 1 times run 5:05 to 7:05 PM', (await row(page, DAY1, 1).locator('.slot-time').textContent()) === '5:05 PM'
    && (await row(page, DAY1, 13).locator('.slot-time').textContent()) === '7:05 PM');
  check('day 2 says its start time is to be confirmed', (await page.locator('.demo-day').nth(1).locator('.demo-day-head .hint').textContent()).startsWith('Start time to be confirmed'));
  await shot(page, '02-signup-page.png');

  await row(page, DAY1, 3).getByRole('button', { name: 'Take this slot' }).click();
  await row(page, DAY1, 3).locator('input[name="title"]').fill('Tide chart for surfers');
  await row(page, DAY1, 3).getByRole('button', { name: 'Claim slot' }).click();
  await row(page, DAY1, 3).and(page.locator('.mine')).waitFor();
  check('claimed: their slot is highlighted with their title', (await row(page, DAY1, 3).locator('.slot-title').textContent()) === 'Tide chart for surfers');
  check('the status line names the slot and time', /Monday, November 30, slot 3 \(about 5:25 PM\)/.test(await page.locator('#my-slot').textContent()));
  await shot(page, '03-claimed.png');

  await row(page, DAY1, 4).getByRole('button', { name: 'Move here' }).click();
  await row(page, DAY1, 4).and(page.locator('.mine')).waitFor();
  check('move: one slot only, now slot 4; slot 3 is open again', !(await row(page, DAY1, 3).evaluate((n) => n.classList.contains('taken'))));
  await row(page, DAY1, 4).getByRole('button', { name: 'Edit title' }).click();
  await row(page, DAY1, 4).locator('input[name="title"]').fill('Tide chart for surfers, live data');
  await row(page, DAY1, 4).getByRole('button', { name: 'Save title' }).click();
  await page.waitForFunction(() => document.querySelector('.demo-slot.mine .slot-title')?.textContent === 'Tide chart for surfers, live data');
  check('edit title saves', true);
  await page.context().close();

  // --- A classmate, on a phone: sees first name + title, claims day 2 ---------
  page = await newPage(browser, { token: TOKENS.other, width: 390, height: 844 });
  await page.goto(`${SITE}/demos/`);
  await page.locator('#main:not(.hidden)').waitFor();
  const theirs = row(page, DAY1, 4);
  check('the classmate sees the first name and title, no buttons on a taken slot',
    (await theirs.locator('.slot-who').textContent()) === firstOf.student
    && (await theirs.locator('.slot-title').textContent()) === 'Tide chart for surfers, live data'
    && (await theirs.locator('button').count()) === 0);
  await row(page, DAY2, 2).getByRole('button', { name: 'Take this slot' }).click();
  await row(page, DAY2, 2).locator('input[name="title"]').fill('Recipe scaler');
  await row(page, DAY2, 2).getByRole('button', { name: 'Claim slot' }).click();
  await row(page, DAY2, 2).and(page.locator('.mine')).waitFor();
  check('phone: claimed a day 2 slot', true);
  check('phone 390: no horizontal scroll on /demos/', await noHScroll(page));
  await row(page, DAY2, 2).scrollIntoViewIfNeeded();
  await shot(page, '04-phone-claimed.png');
  await page.goto(`${SITE}/account/`);
  await page.locator('#demo-signup').waitFor();
  check('their account card shows their slot', /Friday, December 4, slot 2: Recipe scaler\./.test(await page.locator('#demo-signup').textContent()));
  check('phone 390: no horizontal scroll on /account/', await noHScroll(page));
  await page.context().close();

  // --- The instructor: auth first, then reorder, guest, move days, lock, export ---
  for (const [m, p, who] of [['POST', '/instructor/demos/move', 'student'], ['POST', '/instructor/demos/settings', 'student'], ['GET', '/instructor/demos/export', 'other']]) {
    const r = await apiFetch(p, TOKENS[who], m === 'POST' ? { method: m, headers: { 'Content-Type': 'application/json' }, body: '{}' } : {});
    check(`a student gets 403 on ${m} ${p}`, r.status === 403);
  }
  page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto(`${SITE}/instructor/`);
  await page.locator('#main:not(.hidden)').waitFor();
  await page.getByRole('link', { name: 'Final demos' }).click();
  await page.locator('#main:not(.hidden)').waitFor();
  check('instructor: the flag reads closed', (await page.locator('#open-toggle').textContent()) === 'Open sign-up to the class');
  const slotName = (day, pos) => row(page, day, pos).locator('.slot-who').textContent();
  const studentName = await slotName(DAY1, 4);
  check('instructor sees full names', studentName.includes(' '));

  await row(page, DAY1, 4).getByRole('button', { name: /up$/ }).click();
  await page.waitForFunction(([n]) => document.querySelectorAll('.demo-day')[0].querySelectorAll('.demo-slot')[2].querySelector('.slot-who')?.textContent === n, [studentName]);
  check('↑ moves the student from slot 4 to 3', true);
  await row(page, DAY1, 3).getByRole('button', { name: /down$/ }).click();
  await page.waitForFunction(([n]) => document.querySelectorAll('.demo-day')[0].querySelectorAll('.demo-slot')[3].querySelector('.slot-who')?.textContent === n, [studentName]);
  check('↓ moves them back to 4', true);

  await row(page, DAY1, 5).getByRole('button', { name: /^Add a guest/ }).click();
  await row(page, DAY1, 5).locator('input[name="name"]').fill('Visiting Auditor');
  await row(page, DAY1, 5).locator('input[name="title"]').fill('Garden sensor dashboard');
  await row(page, DAY1, 5).getByRole('button', { name: 'Add' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.demo-day')[0].querySelectorAll('.demo-slot')[4].querySelector('.slot-who')?.textContent === 'Visiting Auditor');
  check('a guest/auditor added to slot 5', (await row(page, DAY1, 5).locator('.badge').textContent()) === 'Guest');

  // Drag the guest onto slot 4: the two swap.
  await row(page, DAY1, 5).dragTo(row(page, DAY1, 4));
  await page.waitForFunction(() => document.querySelectorAll('.demo-day')[0].querySelectorAll('.demo-slot')[3].querySelector('.slot-who')?.textContent === 'Visiting Auditor');
  check('drag: the guest dropped on slot 4 swaps with the student', (await slotName(DAY1, 5)) === studentName);

  // Move the classmate from Friday to Monday with "→ Mon".
  const otherName = await slotName(DAY2, 2);
  await row(page, DAY2, 2).getByRole('button', { name: /to Monday/ }).click();
  await page.waitForFunction(([n]) => [...document.querySelectorAll('.demo-day')[0].querySelectorAll('.slot-who')].some((x) => x.textContent === n), [otherName]);
  check('→ Mon moves a student to the other day\'s first open slot', !(await row(page, DAY2, 2).evaluate((n) => n.classList.contains('taken'))));
  await shot(page, '05-instructor.png', { fullPage: true });

  // Lock in the past: students can't change anything.
  await page.locator('#lock-at').fill('2026-11-01T09:00');
  await page.getByRole('button', { name: 'Set lock' }).click();
  await page.waitForFunction(() => document.getElementById('lock-state').textContent.startsWith('Locked since'));
  check('lock set: the page reads locked', true);
  const sp = await newPage(browser, { token: TOKENS.student, width: 1280, height: 900 });
  await sp.goto(`${SITE}/demos/`);
  await sp.locator('#main:not(.hidden)').waitFor();
  check('locked: the student page has no buttons and says so',
    (await sp.locator('.demo-slot button').count()) === 0 && /locked/.test(await sp.locator('#my-slot').textContent()));
  const lockedClaim = await apiFetch('/demos/claim', TOKENS.student, { method: 'DELETE' });
  check('locked: release is refused (403)', lockedClaim.status === 403);
  await sp.context().close();
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.waitForFunction(() => document.getElementById('lock-state').textContent.startsWith('Not locked'));
  check('lock cleared', true);

  await page.getByRole('button', { name: 'Show as text' }).click();
  await page.locator('#export-text:not(.hidden)').waitFor();
  const text = await page.locator('#export-text').textContent();
  check('export: plain text running order with times and full names',
    text.startsWith('Final demos: running order') && text.includes(`5:35 PM  Visiting Auditor (guest): Garden sensor dashboard`)
    && text.includes(`5:45 PM  ${studentName}: Tide chart for surfers, live data`) && text.includes('Friday, December 4 · time to be confirmed'));
  await shot(page, '06-export.png', { clip: await page.locator('.demo-export').boundingBox() });

  if (!prod) {
    // Opening the flag (local only; never in production from here).
    await page.getByRole('button', { name: 'Open sign-up to the class' }).click();
    await page.waitForFunction(() => document.getElementById('open-toggle').textContent === 'Close sign-up');
    const o = await newPage(browser, { token: TOKENS.outsider, width: 1280, height: 900 });
    await o.goto(`${SITE}/`);
    await o.locator('[data-demo-signup]:not(.hidden)').waitFor();
    check('opened: a regular student now sees the home card', true);
    await o.context().close();
    await page.getByRole('button', { name: 'Close sign-up' }).click();
    await page.waitForFunction(() => document.getElementById('open-toggle').textContent === 'Open sign-up to the class');
  }

  // Remove the guest again (prod cleanup also deletes by id).
  await row(page, DAY1, 4).getByRole('button', { name: /^Remove/ }).click();
  await page.waitForFunction(() => !document.querySelectorAll('.demo-day')[0].querySelectorAll('.demo-slot')[3].classList.contains('taken'));
  check('instructor removes the guest', true);
  await page.setViewportSize({ width: 390, height: 844 });
  check('phone 390: no horizontal scroll on the instructor view', await noHScroll(page));
  await shot(page, '07-instructor-phone.png');
  await page.context().close();

  // --- The student releases their slot ---------------------------------------
  page = await newPage(browser, { token: TOKENS.student, width: 1280, height: 900 });
  await page.goto(`${SITE}/demos/`);
  await page.locator('.demo-slot.mine').waitFor();
  await page.locator('.demo-slot.mine').getByRole('button', { name: 'Release' }).click();
  await page.waitForFunction(() => !document.querySelector('.demo-slot.mine'));
  check('release: no slot held', /haven’t picked a slot/.test(await page.locator('#my-slot').textContent()));
  await page.context().close();
  console.log('all checks passed');
} finally {
  await browser.close();
}
