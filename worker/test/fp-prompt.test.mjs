// The personalised final project prompt (/me/final-project-prompt): a student
// only ever gets their own semester, links survive (also through trimming),
// an empty history still yields a usable prompt, and the template is verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtureEnv, TOKENS } from './fixtures/fp-prompt-fixture.mjs';

const here = new URL('.', import.meta.url);
const worker = (await import(new URL('../src/index.js', here))).default;
const { buildPrompt, MAX_PROMPT_CHARS } = await import(new URL('../src/fpprompt.js', here));
const { FP_PROMPT_TEMPLATE, genericPrompt, GENERIC_SLOT } = await import(new URL('../../assets/fp-prompt-template.js', here));
const { WEEKS } = await import(new URL('../src/weeks.generated.js', here));

const get = (env, tok, q = '') => worker.fetch(new Request('https://api.learnvibe.build/me/final-project-prompt' + q, {
  headers: tok ? { Cookie: `lvb_session=${tok}` } : {},
}), env);

const [BEFORE, AFTER] = FP_PROMPT_TEMPLATE.split('{{CONTEXT}}');
const title = (n) => WEEKS.find((w) => w.week === n).title;

test('a student gets their own submissions, board posts and links, and nothing of anyone else', async () => {
  const env = fixtureEnv();
  const res = await get(env, TOKENS.one);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const one = await res.json();
  const p = one.prompt;
  for (const s of ['ONE-W1', 'ONE-W4', 'ONE-W6', 'ONE-POST body', 'ONE-PODPOST body',
    `Week 1: ${title(1)}`, `Week 4: ${title(4)}`, `Week 6: ${title(6)}`, 'to my pod (Pod Tide)',
    'https://one.example/sketch', 'https://one.example/tides', 'https://one.example/demo', 'https://one.example/pod-q']) {
    assert.ok(p.includes(s), `missing ${s}`);
  }
  for (const s of ['TWO-', 'two.example', 'E2E Two', 'E2E One', 'e2e-test']) {
    assert.ok(!p.includes(s), `leaked ${s}`);
  }
  assert.equal(one.chars, p.length);
  assert.equal(one.trimmed, false);
  assert.deepEqual([one.submissions, one.posts], [3, 2]);

  const two = (await (await get(env, TOKENS.two)).json()).prompt;
  assert.ok(two.includes('TWO-W2') && two.includes('https://two.example/recipes') && two.includes('https://two.example/demo'));
  assert.ok(!two.includes('ONE-') && !two.includes('one.example'), "Two's prompt must not carry One's work");
});

test('the prompt is the v3 template verbatim around the context', async () => {
  const { prompt } = await (await get(fixtureEnv(), TOKENS.one)).json();
  assert.ok(prompt.startsWith(BEFORE) && prompt.endsWith(AFTER));
  assert.ok(!prompt.includes('{{CONTEXT}}'));
});

test('an empty history still gives a complete prompt', async () => {
  const res = await get(fixtureEnv(), TOKENS.empty);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(d.prompt.startsWith(BEFORE) && d.prompt.endsWith(AFTER));
  assert.match(d.prompt, /=== MY SEMESTER SO FAR ===\nNothing yet: /);
  assert.deepEqual([d.submissions, d.posts, d.trimmed], [0, 0, false]);
});

test('signed out gets 401; ?as is instructor-only and read-only', async () => {
  const env = fixtureEnv();
  assert.equal((await get(env, null)).status, 401);
  assert.equal((await get(env, 'not-a-token')).status, 401);
  assert.equal((await get(env, TOKENS.one, '?as=2')).status, 403);
  const asOne = await (await get(env, TOKENS.prof, '?as=1')).json();
  assert.ok(asOne.prompt.includes('ONE-W4') && !asOne.prompt.includes('TWO-'));
});

test('a long history is trimmed oldest-first, keeping every week title and link', () => {
  const words = (n, tag) => `${tag} ` + 'lorem ipsum dolor sit amet '.repeat(n);
  const submissions = WEEKS.map((w) => ({
    week: w.week,
    body: `${words(300, `BODY-${w.week}`)} see https://body.example/w${w.week}/notes. ${words(100, 'tail')}`,
    submitted_at: `2026-09-${String(w.week).padStart(2, '0')}T12:00:00Z`,
    link_url: `https://link.example/w${w.week}`,
  }));
  const posts = [{ kind: 'build', title: 'Latest post', body: words(50, 'POST'), link_url: 'https://post.example/x', created_at: '2026-12-01T00:00:00Z' }];
  const out = buildPrompt({ weeks: WEEKS, submissions, posts });
  assert.equal(out.trimmed, true);
  assert.ok(out.chars <= MAX_PROMPT_CHARS, `prompt is ${out.chars} chars`);
  assert.ok(out.prompt.includes('my oldest writing is shortened'));
  assert.ok(out.prompt.startsWith(BEFORE) && out.prompt.endsWith(AFTER));
  for (const w of WEEKS) {
    assert.ok(out.prompt.includes(`### Week ${w.week}: ${w.title}`), `week ${w.week} title lost`);
    assert.ok(out.prompt.includes(`https://link.example/w${w.week}`), `week ${w.week} link lost`);
    assert.ok(out.prompt.includes(`https://body.example/w${w.week}/notes`), `week ${w.week} in-text link lost`);
  }
  assert.ok(out.prompt.includes('https://post.example/x'));
  const last = WEEKS[WEEKS.length - 1].week;
  assert.ok(out.prompt.includes(submissions.find((s) => s.week === last).body.trim()), 'the newest writing stays whole');
  assert.ok(!out.prompt.includes(submissions[0].body.trim()), 'the oldest writing is the one cut');
});

test('trimming stays under the limit when the newest entry is huge and full of links, and never breaks a link', () => {
  const links = Array.from({ length: 60 }, (_, i) => `https://en.example/wiki/Tide_(part_${i}).`);
  const submissions = [
    { week: 1, body: 'old ' + 'words '.repeat(400) + 'https://old.example/a_(b)_c', submitted_at: '2026-08-30T12:00:00Z', link_url: null },
    { week: 2, body: 'new ' + `${links.join(' ')} `.repeat(40), submitted_at: '2026-09-10T12:00:00Z', link_url: null },
  ];
  const out = buildPrompt({ weeks: WEEKS, submissions, posts: [] });
  assert.equal(out.trimmed, true);
  assert.ok(out.chars <= MAX_PROMPT_CHARS, `prompt is ${out.chars} chars`);
  assert.ok(out.prompt.includes('https://old.example/a_(b)_c'), 'a link with parentheses was cut');
  for (const l of links) assert.ok(out.prompt.includes(l.slice(0, -1)), `lost ${l}`);
  // Every URL in the prompt is one of the real ones, whole.
  const real = new Set(['https://old.example/a_(b)_c', ...links.map((l) => l.slice(0, -1))]);
  for (const u of out.prompt.match(/https?:\/\/\S+/g)) assert.ok(real.has(u.replace(/[.,]$/, '')), `broken link ${u}`);
});

test('a history under the limit is never trimmed', () => {
  const out = buildPrompt({ weeks: WEEKS, submissions: [{ week: 1, body: 'short', link_url: null }], posts: [] });
  assert.equal(out.trimmed, false);
  assert.ok(!out.prompt.includes('shortened'));
});

test('the Week 9 lesson shows the same prompt as the generic version', () => {
  const md = readFileSync(new URL('../../lessons/src/week-9.md', here), 'utf8');
  const blocks = [...md.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const block = blocks.find((b) => b.includes(GENERIC_SLOT));
  assert.ok(block, 'lessons/src/week-9.md has no code block with the paste slot');
  assert.equal(block, genericPrompt());
});
