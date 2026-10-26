import { FP_PROMPT_TEMPLATE } from '../../assets/fp-prompt-template.js';
// The personalised final project prompt: the v3 template with {{CONTEXT}}
// filled from one student's own weekly submissions and class-board posts.
// Pure: the Worker queries the rows (scoped to the session's student) and
// passes them in, so tests can feed fixtures straight to it.
//
// Long histories: past MAX_PROMPT_CHARS the oldest writing is shortened
// first. Week titles, dates and every link (including links found inside
// trimmed text) always stay, and the context says it was trimmed.

export const MAX_PROMPT_CHARS = 60000;
const TRIM_MARK = ' […trimmed for length]';
const TRIM_NOTE = 'Note: my full history was too long to paste, so my oldest writing is shortened. Every week title and link is still here.';
const EMPTY = "Nothing yet: I haven't submitted any weekly work or posted on the class board on the course site.";

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

function render({ subs, board }, trimmed) {
  if (!subs.length && !board.length) return EMPTY;
  const parts = [];
  if (trimmed) parts.push(TRIM_NOTE);
  if (subs.length) parts.push('## My weekly submissions', ...subs.map(renderEntry));
  if (board.length) parts.push('## My class board posts', ...board.map(renderEntry));
  return parts.join('\n\n');
}

export function buildContext(data, budget = MAX_PROMPT_CHARS - (FP_PROMPT_TEMPLATE.length - '{{CONTEXT}}'.length)) {
  const groups = entries(data);
  const counts = { submissions: groups.subs.length, posts: groups.board.length };
  const text = render(groups, false);
  if (text.length <= budget) return { context: text, trimmed: false, counts };

  const oldestFirst = [...groups.subs, ...groups.board].sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  const MARK = TRIM_MARK.trim();
  // First pass: shorten the oldest entries, each just enough. Second pass, if the
  // kept-links lines pushed it back over: oldest first, drop the text entirely.
  for (const whole of [false, true]) {
    for (const e of oldestFirst) {
      const over = render(groups, true).length - budget;
      if (over <= 0) return { context: render(groups, true), trimmed: true, counts };
      if (!e.body || e.body === MARK) continue;
      if (!e.cut) { e.full = e.body; e.cut = true; }
      // Leave room for this entry's own kept-links line, and never cut mid-word or mid-link.
      const keep = e.body.length - over - TRIM_MARK.length - linksIn(e.full).join(' ').length - 40;
      const head = whole || keep < 200 ? '' : e.body.slice(0, keep).replace(/\S*$/, '').trimEnd();
      e.body = head ? head + TRIM_MARK : MARK;
    }
  }
  // Only titles, dates and links are left; they always stay.
  return { context: render(groups, true), trimmed: true, counts };
}

export function buildPrompt(data) {
  const { context, trimmed, counts } = buildContext(data);
  const prompt = FP_PROMPT_TEMPLATE.replace('{{CONTEXT}}', () => context);
  return { prompt, chars: prompt.length, trimmed, ...counts };
}
