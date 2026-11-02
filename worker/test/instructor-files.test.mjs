// Uploaded files for the instructor (submission_files + the FILES bucket):
// the instructor gets each student's own files with their text and
// renderings; students and signed-out visitors get 401/403; renderings never
// run as a page in the api origin; student-facing endpoints never carry them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, TOKENS } from './fixtures/fp-prompt-fixture.mjs';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;

const get = (env, tok, path, headers = {}) => worker.fetch(new Request('https://api.learnvibe.build' + path, {
  headers: { ...(tok ? { Cookie: `lvb_session=${tok}` } : {}), ...headers },
}), env);

test('the student page carries each week\'s files, in upload order, with text', async () => {
  const env = fixtureEnv();
  const one = await (await get(env, TOKENS.prof, '/instructor/student?id=1')).json();
  const w4 = one.submissions.find((s) => s.week === 4);
  assert.deepEqual(w4.files.map((f) => [f.name, f.kind, f.pages, f.rendition]),
    [['tide-planner.html', 'html', 0, 'html'], ['final-plan.docx', 'office', 1, null]]);
  assert.match(w4.files[1].text, /ONE-FILE docx text/);
  assert.equal(w4.files[1].canvas_url, 'https://canvas.example/files/32');
  assert.deepEqual(one.submissions.find((s) => s.week === 1).files, []);
  assert.ok(!JSON.stringify(one).includes('TWO-FILE'));
  const two = await (await get(env, TOKENS.prof, '/instructor/student?id=2')).json();
  assert.match(two.submissions.find((s) => s.week === 3).files[0].text, /TWO-FILE pdf text/);
  assert.ok(!JSON.stringify(two).includes('ONE-FILE'));
});

test('/instructor/data lists files without their text; /instructor/files gives one week with text', async () => {
  const env = fixtureEnv();
  const data = await (await get(env, TOKENS.prof, '/instructor/data')).json();
  const one = data.roster.find((s) => s.id === 1);
  const files = one.submissions.find((s) => s.week === 4).files;
  assert.deepEqual(files.map((f) => f.id), [31, 32]);
  assert.equal(files[1].text, undefined);
  assert.equal(files[1].text_chars, 'ONE-FILE docx text: Final project plan'.length);
  const res = await get(env, TOKENS.prof, '/instructor/files?student=1&week=4');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const week = await res.json();
  assert.deepEqual(week.files.map((f) => f.text), ['ONE-FILE html text: Tide planner', 'ONE-FILE docx text: Final project plan']);
  assert.deepEqual((await (await get(env, TOKENS.prof, '/instructor/files?student=2&week=4')).json()).files, []);
  assert.equal((await get(env, TOKENS.prof, '/instructor/files?student=1&week=x')).status, 400);
});

test('page images and the file itself: instructor only, sandboxed, never cached', async () => {
  const env = fixtureEnv();
  const page = await get(env, TOKENS.prof, '/instructor/file/33/p2');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(await page.text(), 'TWO-FILE-JPEG-2');
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert.equal(page.headers.get('Access-Control-Allow-Origin'), 'https://cu.learnvibe.build');
  const html = await get(env, TOKENS.prof, '/instructor/file/31/rendition');
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('Content-Type'), 'text/plain; charset=utf-8', 'student HTML is never served as a page');
  assert.match(html.headers.get('Content-Security-Policy'), /sandbox/);
  assert.equal(html.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(await html.text(), /ONE-FILE html page/);
  const part = await get(env, TOKENS.prof, '/instructor/file/33/p1', { Range: 'bytes=0-3' });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), 'TWO-');
  assert.equal((await get(env, TOKENS.prof, '/instructor/file/33/p3')).status, 404, 'past the last page');
  assert.equal((await get(env, TOKENS.prof, '/instructor/file/32/rendition')).status, 404, 'a docx has pages, not a rendition');
  assert.equal((await get(env, TOKENS.prof, '/instructor/file/99/p1')).status, 404);
  assert.equal((await get(env, TOKENS.prof, '/instructor/file/33/p1.jpg')).status, 404);
});

test('students get 403 on every file route (their own files too); signed out gets 401', async () => {
  const env = fixtureEnv();
  for (const path of ['/instructor/files?student=1&week=4', '/instructor/file/31/rendition',
    '/instructor/file/32/p1', '/instructor/file/33/p1']) {
    for (const tok of [TOKENS.one, TOKENS.two, TOKENS.empty]) {
      const res = await get(env, tok, path);
      assert.equal(res.status, 403, `${tok} ${path}`);
      assert.ok(!(await res.text()).includes('FILE'));
    }
    assert.equal((await get(env, null, path)).status, 401, path);
  }
});

test('student-facing endpoints never carry file text or renderings', async () => {
  const env = fixtureEnv();
  for (const tok of [TOKENS.one, TOKENS.two]) {
    for (const path of ['/me', '/feed', '/board', '/me/pod', '/me/final-project-prompt']) {
      const res = await get(env, tok, path);
      const body = await res.text();
      assert.ok(!/ONE-FILE|TWO-FILE|canvas\.example\/files/.test(body), `${path} leaked a file`);
    }
  }
});
