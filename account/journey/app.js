// My journey — every week, one page, the signed-in student's own work only.
// Data: the same /me payload the account page uses (weeks + this student's
// submissions; the Worker scopes submissions to the session's student).
// Nothing student-specific is in the static HTML. No grades or comments:
// those live in Canvas and belong to the instructor.
import { API_BASE } from '../config.js';
import { dueLabel, whenLabel } from '../../assets/weeks.js';

const $ = (id) => document.getElementById(id);
const LESSON_PAGES = new Set([1, 2, 3, 6]);
const lessonUrl = (n) => (LESSON_PAGES.has(n) ? `../../lessons/week-${n}/` : `../../schedule/#week-${n}`);
const REFLECTION_WEEK = 6;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Instructor view-as: ?as=<student_id>. The Worker enforces it (403 for
// non-instructors, every write refused); this page only renders read-only.
const AS = new URLSearchParams(location.search).get('as');
let READ_ONLY = false;

async function load() {
  let me = null;
  let status = 0;
  try {
    const res = await fetch(API_BASE + '/me' + (AS ? `?as=${encodeURIComponent(AS)}` : ''), { credentials: 'include' });
    status = res.status;
    if (res.ok) me = await res.json();
  } catch { /* fall through to signed out */ }
  $('journey-status').remove();
  if (!me && AS && status !== 401) {
    $('journey').replaceChildren(el('p', 'error', status === 403
      ? 'Only the instructor can view another student\'s journey.'
      : 'That student could not be found.'));
    return;
  }
  if (!me) return signedOut();
  READ_ONLY = !!me.read_only;
  if (me.viewing_as) banner(me.viewing_as);
  if (me.is_instructor || me.viewer_is_instructor) picker(me.viewing_as && me.viewing_as.id);
  render(me);
}

function banner(v) {
  const b = el('div', 'viewas-banner');
  b.setAttribute('role', 'status');
  b.append(el('strong', null, `Viewing as ${v.first_name} — read-only. `));
  const back = el('a', null, 'Back to your view');
  back.href = './';
  b.append(back);
  document.querySelector('.journey-main').prepend(b);
}

async function picker(currentId) {
  const res = await fetch(API_BASE + '/instructor/students', { credentials: 'include' }).catch(() => null);
  if (!res || !res.ok) return;
  const { students } = await res.json();
  const wrap = el('div', 'viewas-picker');
  const label = el('label', 'field-label', 'Instructor: view a student\'s journey (read-only)');
  label.htmlFor = 'viewas-select';
  const sel = el('select');
  sel.id = 'viewas-select';
  sel.append(new Option('Choose a student…', ''));
  for (const s of students) sel.append(new Option(s.name, String(s.id), false, String(s.id) === String(currentId)));
  sel.onchange = () => { location.search = sel.value ? `?as=${sel.value}` : ''; };
  wrap.append(label, sel);
  const main = document.querySelector('.journey-main');
  main.insertBefore(wrap, main.querySelector('#journey'));
}

function signedOut() {
  const box = el('div', 'board-signin');
  box.append(el('h2', null, 'Sign in to see your journey.'));
  box.append(el('p', null, 'Every week you have submitted, in one place, visible only to you.'));
  const a = el('a', 'btn', 'Sign in');
  a.href = '../';
  box.append(a);
  $('journey').replaceChildren(box);
}

function weeksSoFar(me) {
  return (me.weeks || []).filter((w) => w.week <= me.open_week).sort((a, b) => a.week - b.week);
}

function render(me) {
  const weeks = weeksSoFar(me);
  const byWeek = new Map((me.submissions || []).map((s) => [s.week, s]));
  const done = weeks.filter((w) => byWeek.has(w.week)).length;
  const first = (me.name || '').trim().split(/\s+/)[0] || 'you';

  const root = $('journey');
  root.replaceChildren();

  const top = el('section', 'journey-top');
  top.append(el('p', 'kicker', READ_ONLY ? `${first}'s journey · instructor view, read-only` : `${first}'s journey · only you can see this page`));
  top.append(el('h2', null, `You've submitted ${done} of ${weeks.length} weeks so far.`));
  const note = el('div', 'journey-reflect');
  note.append(el('p', null, `This week (Week ${REFLECTION_WEEK}) you're writing one page taking stock of your journey. Read back through your weeks below, then write about:`));
  const ul = el('ul');
  for (const q of ['What you have learned', 'What you are learning now', 'What you want to learn next', 'What you want to build (and emerging ideas for your final project)']) ul.append(el('li', null, q));
  note.append(ul);
  const tip = el('p', 'hint', 'Tip: copy your journey as markdown, paste it into your AI, and ask it what it notices about how you have grown. Then write the page in your own words.');
  note.append(tip);
  const row = el('div', 'journey-actions');
  const copy = el('button', 'btn', 'Copy my journey as markdown');
  copy.type = 'button';
  const msg = el('span', 'hint');
  msg.setAttribute('role', 'status');
  copy.onclick = async () => {
    const md = toMarkdown(me, weeks, byWeek);
    try {
      await navigator.clipboard.writeText(md);
      msg.textContent = 'Copied. Paste it into your AI.';
    } catch {
      showFallback(md);
      msg.textContent = 'Select the text below and copy it.';
    }
  };
  row.append(copy);
  if (!READ_ONLY) {
    const submit = el('a', 'btn ghost', `Submit Week ${REFLECTION_WEEK}`);
    submit.href = `../#week-${REFLECTION_WEEK}`;
    row.append(submit);
  }
  row.append(msg);
  note.append(row);
  top.append(note);
  root.append(top);

  const list = el('ol', 'journey-weeks');
  for (const w of weeks) list.append(weekCard(w, byWeek.get(w.week)));
  root.append(list);
}

function weekCard(w, s) {
  const li = el('li', 'journey-week' + (s ? ' submitted' : ''));
  li.id = `week-${w.week}`;
  li.append(el('p', 'kicker', `Week ${w.week}`));
  li.append(el('h3', null, w.title));
  const meta = el('p', 'journey-meta');
  const due = dueLabel(w.due_at);
  if (due) meta.append(el('span', null, `Due ${due}`));
  meta.append(el('span', 'journey-status ' + (s ? 'is-in' : 'is-open'),
    s ? (s.submitted_at ? `Submitted ${whenLabel(s.submitted_at)}` : 'Submitted') : 'Not submitted yet'));
  li.append(meta);
  if (w.prompt) {
    const d = el('details', 'journey-prompt');
    d.append(el('summary', null, 'The prompt'));
    d.append(el('p', null, w.prompt));
    li.append(d);
  }
  if (s) {
    if (s.link_url) {
      const a = el('a', 'board-link', s.link_url);
      a.href = s.link_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(a);
    }
    if (s.body) {
      const body = el('div', 'journey-body');
      for (const para of s.body.split(/\n{2,}/)) body.append(el('p', null, para));
      li.append(body);
    }
    li.append(el('p', 'journey-share hint',
      `Shared with the class: build ${s.share_build ? 'yes' : 'no'} · writing ${s.share_writing ? 'yes' : 'no'}`));
  }
  const links = el('p', 'journey-links');
  const lesson = el('a', null, LESSON_PAGES.has(w.week) ? `Week ${w.week} lesson` : `Week ${w.week} on the schedule`);
  lesson.href = lessonUrl(w.week);
  links.append(lesson);
  if (!READ_ONLY) {
    const edit = el('a', null, s ? 'View or edit in your account' : 'Submit in your account');
    edit.href = `../#week-${w.week}`;
    links.append(edit);
  }
  li.append(links);
  return li;
}

function toMarkdown(me, weeks, byWeek) {
  const lines = [`# My Learn, Vibe, Build journey`, '', `${me.name || ''}, ATLS 4519, Fall 2026`, ''];
  for (const w of weeks) {
    const s = byWeek.get(w.week);
    lines.push(`## Week ${w.week}: ${w.title}`, '');
    if (w.prompt) lines.push(`Prompt: ${w.prompt}`, '');
    if (!s) { lines.push('_Not submitted yet._', ''); continue; }
    if (s.submitted_at) lines.push(`Submitted: ${s.submitted_at.slice(0, 10)}`, '');
    if (s.link_url) lines.push(`Link: ${s.link_url}`, '');
    if (s.body) lines.push(s.body.trim(), '');
  }
  lines.push('---', '', 'Help me take stock: what have I learned, what am I learning now, what should I learn next, and what might I build? Quote my own words back to me as evidence.');
  return lines.join('\n');
}

function showFallback(md) {
  let ta = $('journey-md');
  if (!ta) {
    ta = el('textarea');
    ta.id = 'journey-md';
    ta.rows = 10;
    ta.readOnly = true;
    ta.style.width = '100%';
    document.querySelector('.journey-reflect').append(ta);
  }
  ta.value = md;
  ta.focus();
  ta.select();
}

load();
