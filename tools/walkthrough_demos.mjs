// Stills for the demo sign-up walkthrough, from the real pages and the real
// Worker over an invented class (no real student data). 1920x1080 (1280x720 at
// 1.5x) for desktop shots, 390 px at 2x for the phone shot.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/walkthrough_demos.mjs <shots-dir>
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const shots = path.resolve(process.argv[2] || 'walkthrough/demo-signup');
await mkdir(shots, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const SITE = 'https://cu.learnvibe.build';

const worker = (await import(path.join(root, 'worker/src/index.js'))).default;
const fx = await import(path.join(root, 'worker/test/fixtures/fp-prompt-fixture.mjs'));
const env = fx.fixtureEnv();
const db = env.DB.db;
db.prepare("UPDATE students SET name = 'Maya Okafor' WHERE id = 1").run();
db.prepare("UPDATE students SET name = 'Theo Brandt' WHERE id = 2").run();
db.prepare("UPDATE students SET name = 'Sam Rivera' WHERE id = 3").run();
const now = new Date().toISOString();
const people = [[21, 'Lena Park', 'Plant-watering reminder that texts you', '2026-11-30', 1], [22, 'Jonah Wells', 'A study-group matcher for ATLAS', '2026-11-30', 2],
  [23, 'Priya Nair', 'Recipe scaler for dorm kitchens', '2026-11-30', 5], [24, 'Diego Castillo', 'Bike-route safety map', '2026-11-30', 7],
  [25, 'Ava Chen', 'Mood journal with weekly patterns', '2026-12-04', 1], [26, 'Noah Fischer', 'Band practice scheduler', '2026-12-04', 3],
  [27, 'Ruby Alvarez', 'Thrift-store price checker', '2026-12-04', 4]];
for (const [id, name, title, day, pos] of people) {
  db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, 0)').run(id, String(id), name, `fictional-${id}@example.invalid`);
  db.prepare('INSERT INTO demo_slots (day, position, student_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(day, pos, id, title, now, now);
}
for (const [id, name] of [[28, 'Owen Kim'], [29, 'Isla Moreau']]) {
  db.prepare('INSERT INTO students (id, canvas_id, name, email, is_instructor) VALUES (?, ?, ?, ?, 0)').run(id, String(id), name, `fictional-${id}@example.invalid`);
}
const T = fx.TOKENS;

async function open(browser, token, { width = 1280, height = 720, scale = 1.5 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  await ctx.addCookies([{ name: 'lvb_session', value: token, domain: '.learnvibe.build', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { window.confirm = () => true; });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.host === 'cu.learnvibe.build') {
      let file = path.join(root, decodeURIComponent(url.pathname));
      if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
      try { return route.fulfill({ status: 200, body: await readFile(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' }); }
      catch { return route.fulfill({ status: 404, body: 'not found' }); }
    }
    if (url.host === 'api.learnvibe.build') {
      const res = await worker.fetch(new Request(url, { method: req.method(), headers: await req.allHeaders(), body: req.postData() || undefined }), env);
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    return route.abort();
  });
  return ctx.newPage();
}
// marks.json: for each still, the boxes (in image pixels) of what its narration is about, each with the second
// into the line when the film rings it: [[x, y, w, h, at], ...].
const marks = {};
const shot = async (page, name, ...rings) => {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shots, name) });
  const k = await page.evaluate(() => window.devicePixelRatio);
  marks[name] = [];
  for (const [mark, at] of rings.map((r) => (Array.isArray(r) ? r : [r, 0.9]))) {
    const b = await (typeof mark === 'string' ? page.locator(mark).first() : mark).boundingBox();
    marks[name].push([...[b.x, b.y, b.width, b.height].map((v) => Math.round(v * k)), at]);
  }
  console.log('wrote', name);
};
const scrollTo = (page, sel, offset = 90) => page.evaluate(([s, o]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + window.scrollY - o), [sel, offset]);
const day = (page, d, pos) => page.locator('.demo-day').nth(d - 1).locator('.demo-slot').nth(pos - 1);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  // 1. The home page card (shown here because this is a preview session).
  let p = await open(browser, T.one);
  await p.goto(`${SITE}/`);
  await p.locator('[data-demo-signup]:not(.hidden)').waitFor();
  await scrollTo(p, '.week-brief', 140);
  await shot(p, '01-home-card.png', '[data-demo-signup]');

  // 2. The page: the Demo day brief.
  await p.goto(`${SITE}/demos/`);
  await p.locator('#main:not(.hidden)').waitFor();
  await scrollTo(p, 'h1', 40);
  await shot(p, '02-brief.png', '.demo-brief');

  // 3. Claim a slot: the title form, then the highlighted slot.
  await scrollTo(p, '#my-slot', 30);
  await day(p, 1, 3).getByRole('button', { name: 'Take this slot' }).click();
  await day(p, 1, 3).locator('input[name="title"]').fill('Tide chart for surfers');
  await shot(p, '03-claim-form.png', day(p, 1, 3));
  await day(p, 1, 3).getByRole('button', { name: 'Claim slot' }).click();
  await p.locator('.demo-slot.mine').waitFor();
  await scrollTo(p, '#my-slot', 30);
  await shot(p, '04-claimed.png', '.demo-slot.mine');
  await p.context().close();

  // 4. The same student on a phone.
  p = await open(browser, T.one, { width: 390, height: 844, scale: 2 });
  await p.goto(`${SITE}/demos/`);
  await p.locator('.demo-slot.mine').waitFor();
  await p.evaluate(() => document.querySelector('.demo-slot.mine').scrollIntoView({ block: 'center' }));
  await shot(p, '05-phone.png');
  await p.context().close();

  // A classmate claims a Friday slot (no still), for the instructor's move below.
  p = await open(browser, T.two, { width: 390, height: 844, scale: 2 });
  await p.goto(`${SITE}/demos/`);
  await p.locator('#main:not(.hidden)').waitFor();
  await day(p, 2, 2).getByRole('button', { name: 'Take this slot' }).click();
  await day(p, 2, 2).locator('input[name="title"]').fill('Recipe scaler');
  await day(p, 2, 2).getByRole('button', { name: 'Claim slot' }).click();
  await p.locator('.demo-slot.mine').waitFor();
  await p.context().close();

  // 5. The instructor view: closed, then reorder, a guest, a move between nights.
  p = await open(browser, T.prof);
  await p.goto(`${SITE}/instructor/demos/`);
  await p.locator('#main:not(.hidden)').waitFor();
  await scrollTo(p, '.demo-controls', 20);
  await day(p, 1, 4).getByRole('button', { name: /^Add a guest/ }).click();
  await day(p, 1, 4).locator('input[name="name"]').fill('Rosa Delgado');
  await day(p, 1, 4).locator('input[name="title"]').fill('Garden sensor dashboard');
  await day(p, 1, 4).getByRole('button', { name: 'Add' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.demo-day')[0].querySelectorAll('.demo-slot')[3].classList.contains('taken'));
  await day(p, 1, 4).dragTo(day(p, 1, 3));
  await p.waitForFunction(() => document.querySelectorAll('.demo-day')[0].querySelectorAll('.demo-slot')[2].querySelector('.slot-who')?.textContent === 'Rosa Delgado');
  await day(p, 2, 2).getByRole('button', { name: /to Monday/ }).click();
  await p.waitForFunction(() => !document.querySelectorAll('.demo-day')[1].querySelectorAll('.demo-slot')[1].classList.contains('taken'));
  await scrollTo(p, '#days', 20);
  await shot(p, '07-instructor-order.png', [day(p, 1, 4).locator('.slot-actions'), 0.9], [day(p, 1, 3), 5.2]);

  // 6. A lock time and the running order as text.
  await p.locator('#lock-at').fill('2026-11-25T17:00');
  await p.getByRole('button', { name: 'Set lock' }).click();
  await p.waitForFunction(() => document.getElementById('lock-state').textContent.startsWith('Locks'));
  await p.getByRole('button', { name: 'Show as text' }).click();
  await p.locator('#export-text:not(.hidden)').waitFor();
  await scrollTo(p, '.demo-export', 20);
  await shot(p, '08-export.png', '#export-text');
  await scrollTo(p, '.demo-controls', 20);
  await shot(p, '09-lock.png', ['#lock-state', 0.9], [p.locator('.demo-day').nth(1).locator('.demo-day-head'), 4.3]);
  await shot(p, '10-closed.png', '#open-toggle');
  await writeFile(path.join(shots, 'marks.json'), JSON.stringify(marks, null, 1) + '\n');
} finally {
  await browser.close();
}
