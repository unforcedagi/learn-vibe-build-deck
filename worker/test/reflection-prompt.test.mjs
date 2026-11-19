// The final reflection prompt (/me/final-reflection-prompt): Week 1 comes
// first as the baseline and is never trimmed away, a student only ever gets
// their own history, and the template says the writing is the student's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEnv, TOKENS } from './fixtures/fp-prompt-fixture.mjs';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const { buildReflectionPrompt, MAX_PROMPT_CHARS } = await import(new URL('../src/fpprompt.js', here));
const { REFLECTION_PROMPT_TEMPLATE, genericPrompt, GENERIC_SLOT } = await import(new URL('../../assets/reflection-prompt-template.js', here));
const { WEEKS } = await import(new URL('../src/weeks.generated.js', here));

const get = (env, tok, q = '') => worker.fetch(new Request('https://api.learnvibe.build/me/final-reflection-prompt' + q, {
  headers: tok ? { Cookie: `lvb_session=${tok}` } : {},
}), env);

const [BEFORE, AFTER] = REFLECTION_PROMPT_TEMPLATE.split('{{CONTEXT}}');
const BASELINE = '## Week 1: where I started (my baseline)';

test('the template: due date, Canvas, interview one or two questions at a time, and the student writes it', () => {
  const t = REFLECTION_PROMPT_TEMPLATE;
  assert.equal(t.split('{{CONTEXT}}').length, 2);
  for (const s of ['Wednesday, December 9 at 11:59 PM', 'Canvas', '"Final Reflection"', 'one or two questions at a time',
    'mine to write, in my own words', "Don't write it or draft any of it for me", 'Week 1']) {
    assert.ok(t.includes(s), `template lacks ${s}`);
  }
  // Aaron grades it; the prompt must not make up a rubric.
  assert.ok(!/rubric|grade|points|criteria/i.test(t), 'template mentions grading');
  assert.ok(genericPrompt().includes(GENERIC_SLOT) && !genericPrompt().includes('{{CONTEXT}}'));
});

test('a student gets Week 1 first as the baseline, then their later work, and nothing of anyone else', async () => {
  const env = fixtureEnv();
  const res = await get(env, TOKENS.one);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const d = await res.json();
  const p = d.prompt;
  assert.ok(p.startsWith(BEFORE) && p.endsWith(AFTER));
  const order = [BASELINE, 'ONE-W1', '## My weekly submissions since Week 1', 'ONE-W4', 'ONE-W6', '## My class board posts', 'ONE-POST', 'ONE-PODPOST'];
  const at = order.map((s) => p.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `missing: ${order.filter((_, i) => at[i] < 0)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'Week 1 must come first, then later weeks, then posts');
  assert.ok(p.includes('https://one.example/sketch') && p.includes('https://one.example/tides'));
  for (const s of ['TWO-', 'two.example', 'E2E One', 'e2e-test']) assert.ok(!p.includes(s), `leaked ${s}`);
  assert.deepEqual([d.submissions, d.posts, d.week1, d.trimmed, d.chars], [3, 2, true, false, p.length]);
});

test('no Week 1 on the site: the baseline says so, later work still follows', async () => {
  const d = await (await get(fixtureEnv(), TOKENS.two)).json();
  assert.ok(d.prompt.includes(`${BASELINE}\n\nI didn't submit a Week 1 intention on the course site.`));
  assert.ok(d.prompt.includes('TWO-W2') && !d.prompt.includes('ONE-'));
  assert.equal(d.week1, false);
});

test('an empty history still gives a complete prompt', async () => {
  const d = await (await get(fixtureEnv(), TOKENS.empty)).json();
  assert.ok(d.prompt.startsWith(BEFORE) && d.prompt.endsWith(AFTER));
  assert.match(d.prompt, /=== MY SEMESTER ===\nNothing yet: /);
  assert.deepEqual([d.submissions, d.posts, d.week1, d.trimmed], [0, 0, false, false]);
});

test('Week 1 only', () => {
  const d = buildReflectionPrompt({ weeks: WEEKS, submissions: [{ week: 1, body: 'W1-ONLY I want to build a game.', submitted_at: '2026-08-30T12:00:00Z', link_url: null }], posts: [] });
  assert.ok(d.prompt.includes(`${BASELINE}\n\n### Week 1: ${WEEKS[0].title}\nSubmitted 2026-08-30\n\nW1-ONLY I want to build a game.`));
  assert.ok(!d.prompt.includes('since Week 1') && !d.prompt.includes('class board posts'));
  assert.deepEqual([d.submissions, d.posts, d.week1, d.trimmed], [1, 0, true, false]);
});

test('signed out gets 401; ?as is instructor-only and read-only', async () => {
  const env = fixtureEnv();
  assert.equal((await get(env, null)).status, 401);
  assert.equal((await get(env, 'not-a-token')).status, 401);
  assert.equal((await get(env, TOKENS.one, '?as=2')).status, 403);
  const asOne = await (await get(env, TOKENS.prof, '?as=1')).json();
  const own = await (await get(env, TOKENS.one)).json();
  assert.equal(asOne.prompt, own.prompt, "the instructor's view-as shows exactly the student's prompt");
  const asTwo = await (await get(env, TOKENS.prof, '?as=2')).json();
  assert.ok(asTwo.prompt.includes('TWO-W2') && !asTwo.prompt.includes('ONE-'));
});

test('a long history is trimmed oldest-but-Week-1 first: Week 1 stays whole, every title and link stays', () => {
  const words = (n, tag) => `${tag} ` + 'lorem ipsum dolor sit amet '.repeat(n);
  const submissions = WEEKS.map((w) => ({
    week: w.week,
    body: `${words(300, `BODY-${w.week}`)} see https://body.example/w${w.week}/notes. ${words(100, 'tail')}`,
    submitted_at: `2026-09-${String(w.week).padStart(2, '0')}T12:00:00Z`,
    link_url: `https://link.example/w${w.week}`,
  }));
  const posts = [{ kind: 'build', title: 'Latest post', body: words(50, 'POST'), link_url: 'https://post.example/x', created_at: '2026-12-01T00:00:00Z' }];
  const out = buildReflectionPrompt({ weeks: WEEKS, submissions, posts });
  assert.equal(out.trimmed, true);
  assert.ok(out.chars <= MAX_PROMPT_CHARS, `prompt is ${out.chars} chars`);
  assert.ok(out.prompt.includes('my oldest writing after Week 1 is shortened'));
  assert.ok(out.prompt.startsWith(BEFORE) && out.prompt.endsWith(AFTER));
  assert.ok(out.prompt.includes(submissions[0].body.trim()), 'Week 1 was trimmed');
  assert.ok(out.prompt.indexOf(submissions[0].body.trim()) < out.prompt.indexOf('### Week 2'), 'Week 1 is not first');
  assert.ok(!out.prompt.includes(submissions[1].body.trim()), 'Week 2, the oldest after Week 1, should be the one cut');
  for (const w of WEEKS) {
    assert.ok(out.prompt.includes(`### Week ${w.week}: ${w.title}`), `week ${w.week} title lost`);
    assert.ok(out.prompt.includes(`https://link.example/w${w.week}`), `week ${w.week} link lost`);
    assert.ok(out.prompt.includes(`https://body.example/w${w.week}/notes`), `week ${w.week} in-text link lost`);
  }
  const last = WEEKS[WEEKS.length - 1].week;
  assert.ok(out.prompt.includes(submissions.find((s) => s.week === last).body.trim()), 'the newest writing stays whole');
});
