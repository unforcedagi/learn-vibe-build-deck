// Learn, Vibe, Build — instructor view.
//
// Session-gated: GET /instructor/data returns 401 (no session) or 403 (signed
// in but not the instructor); either way the data never reaches this page for
// anyone but Aaron. Reads are weekly synthesis notes pushed by Uni through the
// admin API (worker/lvb-read.py); the roster review duplicates the account
// page's dashboard idiom on purpose — the two pages evolve independently.
//
// The demo queue is run-of-class furniture for demo day: it reads the same
// roster payload and keeps its only state (who has already gone) in
// localStorage, so nothing about it touches the server.

import { API_BASE } from '../account/config.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');

const api = (path, opts = {}) =>
  fetch(API_BASE + path, { credentials: 'include', ...opts });

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

  const data = await res.json();
  show($('main'));
  render(data);

  // Deep links like #week-1 land after render, so scroll explicitly.
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }
}

boot();

on('refresh', 'click', async () => {
  const btn = $('refresh');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    const res = await api('/instructor/data');
    if (res.ok) render(await res.json());
  } catch {
    /* leave the current view in place */
  }
  btn.disabled = false;
  btn.textContent = 'Refresh';
});

function on(id, event, fn) {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

// The demo queue runs off the week whose work is being shown, which lags the
// open week: on Sep 14 the class is in week 3 but demos the week-2 builds.
// Bump this the week after CURRENT_WEEK moves.
const DEMO_WEEK = 2;

function render(data) {
  renderStats(data.stats || {}, data.current_week);
  renderDemoQueue(data.roster || [], DEMO_WEEK);
  renderReads(data.reads || []);
  renderRoster(data.roster || [], data.current_week);
}

function renderStats(stats, week) {
  const box = $('stats');
  box.textContent = '';
  const stat = (n, label) => {
    const span = document.createElement('span');
    span.className = 'stat';
    const strong = document.createElement('strong');
    strong.textContent = String(n);
    span.appendChild(strong);
    span.appendChild(document.createTextNode(' ' + label));
    return span;
  };
  const dot = () => {
    const s = document.createElement('span');
    s.className = 'dot';
    s.textContent = '·';
    return s;
  };
  box.appendChild(stat(`${stats.submitted ?? '?'} of ${stats.total ?? '?'}`,
    `submitted week ${week ?? ''}`.trim()));
  box.appendChild(dot());
  box.appendChild(stat(stats.signed_in ?? '?', 'signed in so far'));
}

// ---------------------------------------------------------------------------
// Demo queue — running order for demo day, plus a per-student timer.
// Done-state lives in localStorage under one key per week; it is a convenience
// for whoever is driving the laptop, never a grade or a server-side fact.
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

function renderDemoQueue(roster, currentWeek) {
  const week = currentWeek ?? 2;
  const weekLabel = $('demo-week');
  if (weekLabel) weekLabel.textContent = String(week);

  const done = loadDone(week);
  const ready = [];
  const missing = [];
  for (const student of roster) {
    const sub = (student.submissions || []).find((s) => s.week === week) || null;
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
    when.textContent = ' · ' + new Date(sub.submitted_at).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
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

// Reads grouped by week, newest week first (the API already sorts week DESC).
function renderReads(reads) {
  const box = $('reads');
  box.textContent = '';

  if (reads.length === 0) {
    box.appendChild(emptyNote('No reads yet — Uni pushes them with lvb-read.py.'));
    return;
  }

  const byWeek = new Map();
  for (const r of reads) {
    if (!byWeek.has(r.week)) byWeek.set(r.week, []);
    byWeek.get(r.week).push(r);
  }

  for (const [week, group] of byWeek) {
    const head = document.createElement('h2');
    head.className = 'week-head';
    head.id = `week-${week}`;
    head.textContent = `Week ${week}`;
    const anchor = document.createElement('a');
    anchor.className = 'anchor';
    anchor.href = `#week-${week}`;
    anchor.textContent = '#';
    head.appendChild(anchor);
    box.appendChild(head);

    for (const read of group) box.appendChild(renderRead(read));
  }
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
// Roster review (same behavior as the account dashboard)
// ---------------------------------------------------------------------------

function renderRoster(roster, currentWeek) {
  const tbody = $('roster-rows');
  tbody.textContent = '';

  for (const student of roster) {
    const subs = student.submissions || [];
    const thisWeek = subs.find((s) => s.week === currentWeek) || null;

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

    const status = document.createElement('td');
    if (thisWeek) {
      status.className = 'status-ok';
      status.textContent = 'submitted ';
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = thisWeek.submitted_at
        ? new Date(thisWeek.submitted_at).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric',
          })
        : '';
      status.appendChild(when);
    } else {
      status.className = 'status-missing';
      status.textContent = 'missing';
    }
    tr.appendChild(status);

    const signed = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill' + (student.signed_in ? ' yes' : '');
    pill.textContent = student.signed_in ? 'signed in' : 'never';
    signed.appendChild(pill);
    tr.appendChild(signed);

    const vis = document.createElement('td');
    vis.textContent = thisWeek ? (writingIsShared(thisWeek) ? 'shared with class' : 'private') : '—';
    tr.appendChild(vis);

    tbody.appendChild(tr);
    tr.addEventListener('click', () => toggleStudentDetail(tr, student, subs));
  }
}

function toggleStudentDetail(tr, student, subs) {
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
  td.colSpan = 4;
  if (subs.length === 0) {
    td.appendChild(emptyNote(`Nothing submitted yet from ${student.name}.`));
  } else {
    for (const sub of subs) td.appendChild(renderSubmission(sub));
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
