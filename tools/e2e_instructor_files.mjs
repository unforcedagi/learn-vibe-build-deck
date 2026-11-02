// End-to-end check of uploaded files in the instructor view, in a real
// headless browser, with no production data. The site is served from this
// checkout at its real origin; api.learnvibe.build is answered in-process by
// the real Worker over the fixture class, with week 9 of the throwaway e2e
// student holding the invented uploads rendered for real by
// tools/instructor_files_fixture.py (PDF, Word, RTF, HTML, image).
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node tools/e2e_instructor_files.mjs [shots-dir]
//
// Against prod instead (after `tools/prod_e2e_instructor_files.py seed`):
//   ... node tools/e2e_instructor_files.mjs [shots-dir] --prod <tokens.json>
//
// Exits non-zero on any failed check. With a shots-dir it saves screenshots.
import { readFile, mkdir, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const args = process.argv.slice(2);
const prodIdx = args.indexOf('--prod');
const prod = prodIdx >= 0 ? JSON.parse(await readFile(args[prodIdx + 1], 'utf8')) : null;
const shotsArg = args.find((a, i) => !a.startsWith('--') && !(prodIdx >= 0 && i === prodIdx + 1));
const shots = shotsArg ? path.resolve(shotsArg) : null;
if (shots) await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

let env = null;
let TOKENS;
let studentId;
if (prod) {
  ({ tokens: TOKENS, student_id: studentId } = prod);
} else {
  const worker = (await import(path.join(root, 'worker/src/index.js'))).default;
  const fx = await import(path.join(root, 'worker/test/fixtures/fp-prompt-fixture.mjs'));
  TOKENS = { prof: fx.TOKENS.prof, student: fx.TOKENS.one };
  studentId = 1;
  const out = await mkdtemp(path.join(os.tmpdir(), 'lvb-files-'));
  execFileSync('uv', ['run', '-q', '--no-project', '--with', 'html2text', 'python3',
    path.join(root, 'tools/instructor_files_fixture.py'), out], { stdio: 'inherit' });
  const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  env = fx.fixtureEnv();
  env.DB.prepare("INSERT INTO submissions (student_id, week, body, submitted_at, link_url) VALUES (1, 9, ?, '2026-11-01T20:00:00Z', ?)")
    .bind('ONE-W9 my artifact and plan are attached.\n\n**Uploaded: [artifact.pdf](https://canvas.colorado.edu/files/e2e-fixture-1/download)**\n\nold extracted text\n\n**Comment on Canvas:**\n\nONE-W9 comment: see the plan.',
      'https://canvas.colorado.edu/files/e2e-fixture-1/download').run();
  let id = 900;
  for (const r of manifest.rows) {
    await env.DB.prepare(`INSERT INTO submission_files (id, student_id, week, canvas_file_id, position, name, content_type,
      size, kind, text, pages, rendition, rendition_type, canvas_url, status, render_version, updated_at)
      VALUES (?, 1, 9, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '2026-11-02T00:00:00Z')`)
      .bind(id++, r.canvas_file_id, r.position, r.name, r.content_type, r.size, r.kind, r.text, r.pages,
        r.rendition, r.rendition_type, r.canvas_url, r.status).run();
  }
  for (const o of manifest.objects) env.FILES.objects.set(o.key, new Uint8Array(await readFile(o.file)));
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
// Week 9 only: the fixture student's week 4 has a file with the same name.
const card = (page, name) => page.locator('#week-9 .sub-file', { has: page.locator('.sub-file-name', { hasText: name }) });
const imagesLoaded = (loc) => loc.evaluateAll((imgs) => imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0));
async function waitImages(loc, ms = 20000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await imagesLoaded(loc)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const browser = await chromium.launch();
try {
  // Instructor: the student page, week 9.
  let page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto(`https://cu.learnvibe.build/instructor/student/?id=${studentId}#week-9`);
  await page.locator('#main:not(.hidden)').waitFor();
  const w9 = page.locator('#week-9');
  await w9.locator('.sub-file').first().waitFor();
  check('week 9 shows a card for each of the 5 uploads', (await w9.locator('.sub-file').count()) === 5);
  check('no upload is link-only', (await w9.locator('.sub-file.link-only').count()) === 0);
  check('the Canvas download is not the headline link', (await w9.locator('p.link').count()) === 0);
  check('each card keeps the original as a secondary link', (await w9.locator('.sub-file-orig').count()) === 5);
  const w9text = await w9.textContent();
  if (!prod) {
    check('their writing and Canvas comment show once, the old extracted copy does not',
      w9text.includes('ONE-W9 my artifact') && w9text.includes('ONE-W9 comment') && !w9text.includes('old extracted text'));
  }

  const pdf = card(page, 'artifact.pdf');
  await pdf.scrollIntoViewIfNeeded();
  await pdf.locator('.sub-file-page img').first().waitFor();
  check('PDF opens on its 2 page images, both loaded', (await pdf.locator('.sub-file-page img').count()) === 2 &&
    await waitImages(pdf.locator('.sub-file-page img')));
  await pdf.evaluate((n) => { n.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -260, behavior: 'instant' }); });
  await shot(page, '01-pdf-pages.png');
  await pdf.getByRole('tab', { name: 'Text' }).click();
  check('PDF text tab has the extracted text', (await pdf.locator('.sub-file-panel').textContent()).includes('FIXTURE-PDF page two'));

  for (const [name, marker] of [['final-plan.docx', 'FIXTURE-DOCX body'], ['progress-report.rtf', 'FIXTURE-RTF body']]) {
    const c = card(page, name);
    await c.getByRole('tab', { name: 'Text' }).click();
    check(`${name}: text readable on the page`, (await c.locator('.sub-file-panel').textContent()).includes(marker));
    await c.getByRole('tab', { name: /Pages/ }).click();
    await c.locator('.sub-file-page img').first().waitFor();
    await c.scrollIntoViewIfNeeded();
    check(`${name}: page images render`, await waitImages(c.locator('.sub-file-page img')));
  }
  const docx = card(page, 'final-plan.docx');
  await docx.getByRole('tab', { name: 'Text' }).click();
  await docx.evaluate((n) => { n.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -20, behavior: 'instant' }); });
  await shot(page, '02-docx-text.png');

  const html = card(page, 'tide-planner.html');
  await html.getByRole('tab', { name: 'Text' }).click();
  check('HTML: text extracted without its script', (await html.textContent()).includes('FIXTURE-HTML body') &&
    !(await html.textContent()).includes('addEventListener'));
  await html.getByRole('tab', { name: 'The page' }).click();
  await html.getByRole('button', { name: 'Show the page' }).click();
  const frame = html.locator('iframe.sub-file-frame');
  await frame.waitFor();
  check('HTML runs only in a sandbox without allow-same-origin', (await frame.getAttribute('sandbox')) === 'allow-scripts');
  const inner = page.frameLocator('.sub-file[data-file-id] iframe.sub-file-frame');
  await inner.locator('#js', { hasText: 'FIXTURE-JS ran inside the sandbox' }).waitFor();
  check('its script ran inside the frame but could not reach this page', !(await page.title()).includes('ESCAPED'));
  const cookieInFrame = await page.frames().find((f) => f !== page.mainFrame()).evaluate(() => {
    try { return document.cookie; } catch (e) { return 'blocked:' + e.name; }
  });
  check('the frame has no cookie access (opaque origin)', cookieInFrame.startsWith('blocked:'));
  await html.evaluate((n) => { n.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -20, behavior: 'instant' }); });
  await shot(page, '03-html-sandboxed.png');

  const png = card(page, 'screenshot.png');
  await png.locator('img.sub-file-image').waitFor();
  await png.scrollIntoViewIfNeeded();
  check('image shows inline', await waitImages(png.locator('img.sub-file-image')));
  await page.context().close();

  // The roster: the week 9 row opens the files in place.
  page = await newPage(browser, { token: TOKENS.prof, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/instructor/#week-9');
  await page.locator('#main:not(.hidden)').waitFor();
  const row = page.locator('tr.student', { hasText: prod ? 'E2E' : 'E2E One' }).first();
  check('roster names the upload instead of a Canvas link', (await row.locator('.files-label').textContent()).startsWith('artifact.pdf + 4 more'));
  await row.click();
  await page.locator('tr.detail-row .sub-file').first().waitFor();
  check('roster detail shows the 5 file cards', (await page.locator('tr.detail-row .sub-file').count()) === 5);
  await row.evaluate((n) => { n.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -60, behavior: 'instant' }); });
  if (!prod) await shot(page, '04-roster-detail.png'); // in prod the roster shows real names
  const demo = page.locator('#demo-rows li', { hasText: prod ? 'E2E' : 'E2E One' }).first();
  check('demo queue links to the readable student page', (await demo.locator('a').getAttribute('href')).endsWith(`#week-9`));
  await page.context().close();

  // A student gets 403 on the file data and routes, even for their own files.
  page = await newPage(browser, { token: TOKENS.student, width: 1280, height: 900 });
  await page.goto('https://cu.learnvibe.build/account/');
  const statuses = await page.evaluate(async (sid) => {
    const out = [];
    for (const p of [`/instructor/files?student=${sid}&week=9`, `/instructor/student?id=${sid}`, '/instructor/data']) {
      out.push((await fetch('https://api.learnvibe.build' + p, { credentials: 'include' })).status);
    }
    return out;
  }, studentId);
  check(`student gets 403 on files, student page and roster (${statuses})`, statuses.every((s) => s === 403));
  await page.context().close();

  // Phone width.
  page = await newPage(browser, { token: TOKENS.prof, width: 390, height: 844 });
  await page.goto(`https://cu.learnvibe.build/instructor/student/?id=${studentId}#week-9`);
  await page.locator('#week-9 .sub-file').first().waitFor();
  await card(page, 'artifact.pdf').evaluate((n) => { n.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -120, behavior: 'instant' }); });
  await waitImages(card(page, 'artifact.pdf').locator('.sub-file-page img').first());
  check('phone: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await shot(page, '05-phone-pdf.png');
  await card(page, 'final-plan.docx').getByRole('tab', { name: 'Text' }).click();
  await card(page, 'final-plan.docx').evaluate((n) => { n.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -20, behavior: 'instant' }); });
  await shot(page, '06-phone-docx-text.png');
  await page.context().close();
} finally {
  await browser.close();
}
console.log('all checks passed');
