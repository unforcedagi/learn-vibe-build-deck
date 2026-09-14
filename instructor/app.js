// Learn, Vibe, Build — instructor view.
//
// Session-gated: GET /instructor/data returns 401 (no session) or 403 (signed
// in but not the instructor); either way the data never reaches this page for
// anyone but Aaron.
//
// The whole page is scoped to one selected week. There is exactly one fetch;
// switching tabs is pure client-side re-render of the same payload, so moving
// between weeks in front of the room is instant. The selected week lives in
// the URL hash (#week-2), which makes a tab linkable and survives a reload.
//
// Weeks themselves come from the API (worker/src/index.js `WEEKS`) — no week
// number, title or date is hardcoded here.

import { API_BASE } from '../account/config.js';
import {
  weekLabel, dueLabel, whenLabel, findWeek,
  renderWeekTabs, weekFromHash, onWeekHashChange, defaultWeek,
} from '../assets/weeks.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');

function on(id, event, fn) {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
}

const api = (path, opts = {}) =>
  fetch(API_BASE + path, { credentials: 'include', ...opts });

// ---------------------------------------------------------------------------
// One payload, one selected week. Everything below reads from here.
// ---------------------------------------------------------------------------

const state = {
  weeks: [],
  openWeek: null,
  roster: [],
  reads: [],
  stats: {},
  week: null,
};

// ---------------------------------------------------------------------------
// Boot + gate
// ---------------------------------------------------------------------------

async function boot() {
  let res;
  try {
    res = await api('/instructor/data');
  } catch {
    hide($('loading'));
    show($('signedout'));
    return;
  }
  hide($('loading'));

  if (res.status === 401) { show($('signedout')); return; }
  if (res.status === 403) { show($('denied')); return; }
  if (!res.ok) { show($('signedout')); return; }

  show($('main'));
  load(await res.json());

  onWeekHashChange((week) => {
    if (findWeek(state.weeks, week)) selectWeek(week);
  });
}

boot();

on('refresh', 'click', async () => {
  const btn = $('refresh');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    const res = await api('/instructor/data');
    if (res.ok) load(await res.json(), state.week);
  } catch {
    /* leave the current view in place */
  }
  btn.disabled = false;
  btn.textContent = 'Refresh';
});

// Take a fresh payload and pick which week to show. `keep` holds the current
// tab across a Refresh; otherwise the hash wins, then the default rule.
function load(data, keep = null) {
  state.weeks = data.weeks || [];
  state.openWeek = data.open_week ?? null;
  state.roster = data.roster || [];
  state.reads = data.reads || [];
  state.stats = data.stats || {};

  const submittedCount = (week) => state.stats.by_week?.[String(week)]?.submitted ?? 0;
  const wanted = keep ?? weekFromHash();
  const week = (wanted != null && findWeek(state.weeks, wanted))
    ? wanted
    : defaultWeek(state.weeks, state.openWeek, submittedCount);

  selectWeek(week);
}

function selectWeek(week) {
  state.week = week;
  renderWeekTabs($('week-tabs'), state.weeks, week);
  renderWeekStatus();
  renderStats();
  renderDemoQueue();
  renderReads();
  renderRoster();
}

// ---------------------------------------------------------------------------
// Week header + stat tiles
// ---------------------------------------------------------------------------

// "Week 2 — Build something · due Sunday Sep 13, 11:59 PM · 23 of 25 submitted"
function renderWeekStatus() {
  const box = $('week-status');
  if (!box) return;
  box.textContent = '';
  const w = findWeek(state.weeks, state.week);
  if (!w) return;

  const sep = () => {
    const s = document.createElement('span');
    s.className = 'sep';
    s.textContent = '·';
    return s;
  };

  const title = document.createElement('strong');
  title.textContent = weekLabel(w);
  box.appendChild(title);

  const due = dueLabel(w.due_at);
  if (due) {
    box.appendChild(sep());
    box.appendChild(document.createTextNode(`due ${due}`));
  }

  const counts = state.stats.by_week?.[String(w.week)] || {};
  box.appendChild(sep());
  box.appendChild(document.createTextNode(
    `${counts.submitted ?? 0} of ${state.stats.total ?? state.roster.length} submitted`));

  if (w.canvas_url) {
    box.appendChild(sep());
    const a = document.createElement('a');
    a.href = w.canvas_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Canvas assignment';
    box.appendChild(a);
  }
}

function statTile(n, label) {
  const div = document.createElement('div');
  div.className = 'stat-tile';
  const num = document.createElement('span');
  num.className = 'n';
  num.textContent = String(n);
  const key = document.createElement('span');
  key.className = 'k';
  key.textContent = label;
  div.appendChild(num);
  div.appendChild(key);
  return div;
}

function renderStats() {
  const box = $('stats');
  if (!box) return;
  box.textContent = '';
  const total = state.stats.total ?? state.roster.length;
  const counts = state.stats.by_week?.[String(state.week)] || {};

  box.appendChild(statTile(`${counts.submitted ?? 0} of ${total}`,
    `submitted · week ${state.week}`));
  box.appendChild(statTile(counts.shared_build ?? 0, `shared build · week ${state.week}`));
  box.appendChild(statTile(counts.shared_writing ?? 0, `shared writing · week ${state.week}`));
  box.appendChild(statTile(state.stats.signed_in ?? 0, 'signed in · all time'));
}

// ---------------------------------------------------------------------------
// Demo queue — running order for demo day, plus a per-student timer.
// Scoped to the selected week. Done-state lives in localStorage under one key
// per week; it is a convenience for whoever is driving the laptop, never a
// grade or a server-side fact.
// ---------------------------------------------------------------------------

const DEMO_SECONDS = 4 * 60;
const doneKey = (week) => `lvb-demo-done-w${week}`;
// First bare URL in a body, for the students who pasted their link into the
// writing instead of the link field.
const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/;

function loadDone(week) {
  try {
    const list = JSON.parse(localStorage.getItem(doneKey(week)) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set(); // storage blocked or value corrupted — start clean
  }
}

function saveDone(week, done) {
  try {
    localStorage.setItem(doneKey(week), JSON.stringify([...done]));
  } catch {
    /* nothing to do — the checkbox still works for this page view */
  }
}

function firstUrlIn(text) {
  const match = URL_IN_TEXT.exec(text || '');
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}'"]+$/, ''); // trailing prose punctuation
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    const tail = u.pathname === '/' ? '' : u.pathname;
    const label = u.host + tail;
    return label.length > 48 ? label.slice(0, 47) + '…' : label;
  } catch {
    return url;
  }
}

function subFor(student, week) {
  return (student.submissions || []).find((s) => s.week === week) || null;
}

function renderDemoQueue() {
  const week = state.week;
  const heading = $('demo-heading');
  if (heading) heading.textContent = `Demo queue — ${weekLabel(findWeek(state.weeks, week))}`;

  const done = loadDone(week);
  const ready = [];
  const missing = [];
  for (const student of state.roster) {
    const sub = subFor(student, week);
    (sub ? ready : missing).push({ student, sub });
  }
  // Submission time is the running order; a row with no timestamp goes last
  // ('~' sorts after any digit), then alphabetically.
  ready.sort((a, b) =>
    (a.sub.submitted_at || '~').localeCompare(b.sub.submitted_at || '~') ||
    a.student.name.localeCompare(b.student.name));
  missing.sort((a, b) => a.student.name.localeCompare(b.student.name));

  const list = $('demo-rows');
  list.textContent = '';
  if (ready.length === 0) {
    list.appendChild(emptyNote(`Nobody has submitted week ${week} yet.`));
  }
  for (const row of ready) list.appendChild(demoRow(row.student, row.sub, week, done));

  const rest = $('demo-missing');
  rest.textContent = '';
  if (missing.length === 0) {
    rest.appendChild(emptyNote('Everyone has submitted.'));
  }
  for (const row of missing) rest.appendChild(demoRow(row.student, null, week, done));
}

function demoRow(student, sub, week, done) {
  const li = document.createElement('li');
  if (done.has(student.email)) li.className = 'done';

  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = done.has(student.email);
  box.addEventListener('change', () => {
    if (box.checked) done.add(student.email);
    else done.delete(student.email);
    li.classList.toggle('done', box.checked);
    saveDone(week, done);
  });
  label.appendChild(box);
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = ' ' + student.name;
  label.appendChild(who);
  li.appendChild(label);

  if (!sub) return li; // "not submitted yet" — name only, they demo off their own laptop

  const url = sub.link_url || firstUrlIn(sub.body);
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = shortUrl(url);
    li.appendChild(a);
  } else {
    const none = document.createElement('span');
    none.className = 'nolink';
    none.textContent = 'no link — their laptop';
    li.appendChild(none);
  }

  if (sub.submitted_at) {
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = ' · ' + whenLabel(sub.submitted_at);
    li.appendChild(when);
  }
  return li;
}

// The timer counts down from a wall-clock deadline, so a backgrounded tab
// catches up instead of drifting. No sound — the room is the sound.
let demoInterval = null;
let demoEndsAt = 0;

function paintClock(secondsLeft) {
  const clock = $('demo-clock');
  if (!clock) return;
  const s = Math.max(0, Math.ceil(secondsLeft));
  clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  clock.classList.toggle('low', s < 30);
}

function stopClock() {
  if (demoInterval) clearInterval(demoInterval);
  demoInterval = null;
}

on('demo-start', 'click', () => {
  stopClock();
  demoEndsAt = Date.now() + DEMO_SECONDS * 1000;
  paintClock(DEMO_SECONDS);
  demoInterval = setInterval(() => {
    const left = (demoEndsAt - Date.now()) / 1000;
    paintClock(left);
    if (left <= 0) stopClock(); // 0:00 stays on screen, in red
  }, 250);
});

on('demo-reset', 'click', () => {
  stopClock();
  paintClock(DEMO_SECONDS);
});

// ---------------------------------------------------------------------------
// Reads — only the selected week's, both audiences.
// ---------------------------------------------------------------------------

function renderReads() {
  const box = $('reads');
  box.textContent = '';
  const heading = $('reads-heading');
  if (heading) heading.textContent = `Reads — week ${state.week}`;

  const mine = state.reads.filter((r) => r.week === state.week);
  if (mine.length === 0) {
    box.appendChild(emptyNote(
      `No reads for week ${state.week} yet — Uni pushes them with lvb-read.py.`));
    return;
  }
  for (const read of mine) box.appendChild(renderRead(read));
}

function renderRead(read) {
  const card = document.createElement('div');
  card.className = 'card read';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = read.title || read.slug;
  meta.appendChild(title);

  const badge = document.createElement('span');
  const shareable = read.audience === 'class';
  badge.className = 'badge ' + (shareable ? 'public' : 'private-badge');
  badge.textContent = shareable ? 'class-shareable' : 'private to you';
  meta.appendChild(badge);

  if (read.updated_at) {
    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = 'updated ' + new Date(read.updated_at).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    });
    meta.appendChild(date);
  }

  card.appendChild(meta);
  card.appendChild(markdownBody(read.body));
  return card;
}

// ---------------------------------------------------------------------------
// Roster — the selected week's status per student, plus an all-weeks grid.
// ---------------------------------------------------------------------------

const ROSTER_COLS = 5;

function renderRoster() {
  const tbody = $('roster-rows');
  tbody.textContent = '';

  const col = $('col-week');
  if (col) col.textContent = `Week ${state.week}`;
  const heading = $('roster-heading');
  if (heading) heading.textContent = `Roster — week ${state.week}`;

  for (const student of state.roster) {
    const sub = subFor(student, state.week);

    const tr = document.createElement('tr');
    tr.className = 'student';

    const name = document.createElement('td');
    name.className = 'name';
    name.textContent = student.name;
    const email = document.createElement('span');
    email.className = 'email-sub';
    email.textContent = student.email;
    name.appendChild(email);
    tr.appendChild(name);

    tr.appendChild(statusCell(sub));
    tr.appendChild(sharesCell(sub));
    tr.appendChild(gridCell(student));

    const signed = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill' + (student.signed_in ? ' yes' : '');
    pill.textContent = student.signed_in ? 'signed in' : 'never';
    signed.appendChild(pill);
    tr.appendChild(signed);

    tbody.appendChild(tr);
    tr.addEventListener('click', () => toggleStudentDetail(tr, student, sub));
  }
}

function statusCell(sub) {
  const td = document.createElement('td');
  if (!sub) {
    td.className = 'status-missing';
    td.textContent = 'not submitted';
    return td;
  }
  td.className = 'status-ok';
  td.textContent = 'submitted ';
  const when = document.createElement('span');
  when.className = 'when';
  when.textContent = whenLabel(sub.submitted_at);
  td.appendChild(when);

  const url = sub.link_url || firstUrlIn(sub.body);
  if (url) {
    const p = document.createElement('div');
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = shortUrl(url);
    // The row toggles the body open; the link should just open the link.
    a.addEventListener('click', (e) => e.stopPropagation());
    p.appendChild(a);
    td.appendChild(p);
  }
  return td;
}

function sharesCell(sub) {
  const td = document.createElement('td');
  if (!sub) {
    td.textContent = '—';
    return td;
  }
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.gap = '0.35rem';
  wrap.style.flexWrap = 'wrap';
  if (sub.link_url) wrap.appendChild(shareBadge('Build', !!sub.share_build));
  wrap.appendChild(shareBadge('Writing', writingIsShared(sub)));
  td.appendChild(wrap);
  return td;
}

function shareBadge(label, shared) {
  const b = document.createElement('span');
  b.className = 'badge' + (shared ? ' public' : '');
  b.textContent = shared ? label : `${label}: private`;
  return b;
}

// Every week at once: ✓ submitted, · not. The selected week is ringed.
function gridCell(student) {
  const td = document.createElement('td');
  const grid = document.createElement('div');
  grid.className = 'weekgrid';
  for (const w of state.weeks) {
    const cell = document.createElement('span');
    const has = !!subFor(student, w.week);
    cell.className = 'wg' + (has ? ' yes' : '') + (w.week === state.week ? ' sel' : '');
    cell.textContent = has ? '✓' : '·';
    cell.title = `Week ${w.week} — ${has ? 'submitted' : 'not submitted'}`;
    grid.appendChild(cell);
  }
  td.appendChild(grid);
  return td;
}

function toggleStudentDetail(tr, student, sub) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('detail-row')) {
    next.remove();
    tr.classList.remove('open');
    return;
  }
  const tbody = tr.parentElement;
  for (const row of [...tbody.querySelectorAll('tr.detail-row')]) row.remove();
  for (const row of [...tbody.querySelectorAll('tr.open')]) row.classList.remove('open');

  tr.classList.add('open');
  const detail = document.createElement('tr');
  detail.className = 'detail-row';
  const td = document.createElement('td');
  td.colSpan = ROSTER_COLS;
  if (sub) {
    td.appendChild(renderSubmission(sub));
  } else {
    td.appendChild(emptyNote(
      `Nothing from ${student.name} for week ${state.week}.`));
  }
  detail.appendChild(td);
  tr.after(detail);
}

// Week-1 Canvas rows carry `visibility` instead of `share_writing` — fall
// back so both shapes render correctly (same contract as account/app.js).
function writingIsShared(sub) {
  return sub.share_writing !== undefined ? !!sub.share_writing : sub.visibility === 'class';
}

function renderSubmission(sub) {
  const card = document.createElement('div');
  card.className = 'card';

  const meta = document.createElement('div');
  meta.className = 'meta read';
  const week = document.createElement('span');
  week.className = 'title';
  week.textContent = `Week ${sub.week}`;
  week.style.marginRight = '0.8rem';
  meta.appendChild(week);

  if (sub.link_url) {
    const buildBadge = document.createElement('span');
    buildBadge.className = 'badge' + (sub.share_build ? ' public' : '');
    buildBadge.textContent = `Build: ${sub.share_build ? 'shared' : 'private'}`;
    meta.appendChild(buildBadge);
  }

  const shared = writingIsShared(sub);
  const badge = document.createElement('span');
  badge.className = 'badge' + (shared ? ' public' : '');
  badge.textContent = `Writing: ${shared ? 'shared' : 'private'}`;
  meta.appendChild(badge);
  meta.style.display = 'flex';
  meta.style.gap = '0.8rem';
  meta.style.alignItems = 'baseline';
  meta.style.marginBottom = '0.5rem';

  card.appendChild(meta);

  if (sub.link_url) {
    const link = document.createElement('p');
    link.style.margin = '0 0 0.6rem';
    const a = document.createElement('a');
    a.href = sub.link_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = sub.link_url;
    link.appendChild(a);
    card.appendChild(link);
  }

  card.appendChild(markdownBody(sub.body));
  return card;
}

// ---------------------------------------------------------------------------
// Markdown (same contract as account/: marked -> DOMPurify, never raw HTML)
// ---------------------------------------------------------------------------

function markdownBody(md) {
  const div = document.createElement('div');
  div.className = 'body md';
  if (window.marked && window.DOMPurify) {
    const html = window.marked.parse(md || '', { async: false });
    div.innerHTML = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  } else {
    // CDN unreachable — fall back to plain paragraphs, never raw HTML.
    for (const para of (md || '').split(/\n\s*\n/)) {
      if (!para.trim()) continue;
      const p = document.createElement('p');
      p.textContent = para.trim();
      div.appendChild(p);
    }
  }
  return div;
}

function emptyNote(msg) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = msg;
  return p;
}
