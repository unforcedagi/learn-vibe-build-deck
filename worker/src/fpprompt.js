import { FP_PROMPT_TEMPLATE } from '../../assets/fp-prompt-template.js';
import { REFLECTION_PROMPT_TEMPLATE } from '../../assets/reflection-prompt-template.js';
// The two personalised prompts on My journey, each a template with {{CONTEXT}}
// filled from one student's own weekly submissions and class-board posts:
// the final project prompt (buildPrompt) and the final reflection prompt
// (buildReflectionPrompt), which puts Week 1 first as the baseline.
// Pure: the Worker queries the rows (scoped to the session's student) and
// passes them in, so tests can feed fixtures straight to it.
//
// Long histories: past MAX_PROMPT_CHARS the oldest writing is shortened
// first. Week titles, dates and every link (including links found inside
// trimmed text) always stay, and the context says it was trimmed. With
// baseline on, Week 1's writing is never shortened: trimming starts after it.

export const MAX_PROMPT_CHARS = 60000;
const TRIM_MARK = ' […trimmed for length]';
const TRIM_NOTE = 'Note: my full history was too long to paste, so my oldest writing is shortened. Every week title and link is still here.';
const TRIM_NOTE_BASELINE = 'Note: my full history was too long to paste, so my oldest writing after Week 1 is shortened. Week 1 is whole, and every week title and link is still here.';
const EMPTY = "Nothing yet: I haven't submitted any weekly work or posted on the class board on the course site.";
const NO_BASELINE = "I didn't submit a Week 1 intention on the course site.";

// Parentheses are allowed inside a link (wiki/Tide_(band)); an unmatched
// closing one, or trailing punctuation, belongs to the sentence.
const URL_RE = /https?:\/\/[^\s<>"'\]]+/g;
function cleanUrl(u) {
  for (;;) {
    const before = u;
    u = u.replace(/[.,;:!?]+$/, '');
    if (u.endsWith(')') && u.split('(').length < u.split(')').length) u = u.slice(0, -1);
    if (u === before) return u;
  }
}
const linksIn = (text) => [...new Set((String(text || '').match(URL_RE) || []).map(cleanUrl))];
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

// One entry per submission and per post, oldest first: the order trimming eats in.
function entries({ weeks = [], submissions = [], posts = [] }) {
  const titles = new Map(weeks.map((w) => [w.week, w.title]));
  const subs = submissions
    .filter((s) => (s.body && s.body.trim()) || s.link_url)
    .map((s) => ({
      kind: 'submission',
      week: s.week,
      when: s.submitted_at || '',
      heading: titles.has(s.week) ? `Week ${s.week}: ${titles.get(s.week)}` : `Week ${s.week}`,
      meta: s.submitted_at ? `Submitted ${day(s.submitted_at)}` : '',
      link: s.link_url || '',
      body: (s.body || '').trim(),
    }));
  const board = posts.map((p) => ({
    kind: 'post',
    when: p.created_at || '',
    heading: p.title,
    meta: [`Posted ${day(p.created_at)}`, p.kind, p.pod_name ? `to my pod (${p.pod_name})` : 'to the class'].filter(Boolean).join(' · '),
    link: p.link_url || '',
    body: (p.body || '').trim(),
  }));
  const byTime = (a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0);
  return { subs: subs.sort((a, b) => a.week - b.week || byTime(a, b)), board: board.sort(byTime) };
}

function renderEntry(e) {
  const lines = [`### ${e.heading}`];
  if (e.meta) lines.push(e.meta);
  if (e.link) lines.push(`Link: ${e.link}`);
  if (e.cut) {
    const kept = linksIn(e.full).filter((u) => u !== e.link && !e.body.includes(u));
    if (kept.length) lines.push(`Links in the trimmed text: ${kept.join(' ')}`);
  }
  if (e.body) lines.push('', e.body);
  return lines.join('\n');
}

function render({ subs, board, base }, trimmed, baseline) {
  if (!subs.length && !board.length) return EMPTY;
  const parts = [];
  if (trimmed) parts.push(baseline ? TRIM_NOTE_BASELINE : TRIM_NOTE);
  if (baseline) {
    parts.push('## Week 1: where I started (my baseline)', base ? renderEntry(base) : NO_BASELINE);
    const later = subs.filter((e) => e !== base);
    if (later.length) parts.push('## My weekly submissions since Week 1', ...later.map(renderEntry));
  } else if (subs.length) parts.push('## My weekly submissions', ...subs.map(renderEntry));
  if (board.length) parts.push('## My class board posts', ...board.map(renderEntry));
  return parts.join('\n\n');
}

const fixedChars = (template) => template.length - '{{CONTEXT}}'.length;

// baseline: Week 1 goes first under its own heading and its text is never trimmed.
export function buildContext(data, { budget = MAX_PROMPT_CHARS - fixedChars(FP_PROMPT_TEMPLATE), baseline = false } = {}) {
  const groups = entries(data);
  // Week 1 has one submission per student (UNIQUE(student_id, week)).
  groups.base = baseline ? groups.subs.find((e) => e.week === 1) || null : null;
  const counts = { submissions: groups.subs.length, posts: groups.board.length };
  if (baseline) counts.week1 = !!groups.base;
  const text = render(groups, false, baseline);
  if (text.length <= budget) return { context: text, trimmed: false, counts };

  const oldestFirst = [...groups.subs, ...groups.board].filter((e) => e !== groups.base)
    .sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  const MARK = TRIM_MARK.trim();
  // First pass: shorten the oldest entries, each just enough. Second pass, if the
  // kept-links lines pushed it back over: oldest first, drop the text entirely.
  for (const whole of [false, true]) {
    for (const e of oldestFirst) {
      const over = render(groups, true, baseline).length - budget;
      if (over <= 0) return { context: render(groups, true, baseline), trimmed: true, counts };
      if (!e.body || e.body === MARK) continue;
      if (!e.cut) { e.full = e.body; e.cut = true; }
      // Leave room for this entry's own kept-links line, and never cut mid-word or mid-link.
      const keep = e.body.length - over - TRIM_MARK.length - linksIn(e.full).join(' ').length - 40;
      const head = whole || keep < 200 ? '' : e.body.slice(0, keep).replace(/\S*$/, '').trimEnd();
      e.body = head ? head + TRIM_MARK : MARK;
    }
  }
  // Only titles, dates and links are left; they always stay.
  return { context: render(groups, true, baseline), trimmed: true, counts };
}

function fill(template, data, baseline) {
  const { context, trimmed, counts } = buildContext(data, { budget: MAX_PROMPT_CHARS - fixedChars(template), baseline });
  const prompt = template.replace('{{CONTEXT}}', () => context);
  return { prompt, chars: prompt.length, trimmed, ...counts };
}

export const buildPrompt = (data) => fill(FP_PROMPT_TEMPLATE, data, false);
export const buildReflectionPrompt = (data) => fill(REFLECTION_PROMPT_TEMPLATE, data, true);
