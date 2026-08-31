// Learn, Vibe, Build — instructor view.
//
// Session-gated: GET /instructor/data returns 401 (no session) or 403 (signed
// in but not the instructor); either way the data never reaches this page for
// anyone but Aaron. Reads are weekly synthesis notes pushed by Uni through the
// admin API (worker/lvb-read.py); the roster review duplicates the account
// page's dashboard idiom on purpose — the two pages evolve independently.

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

function render(data) {
  renderStats(data.stats || {}, data.current_week);
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
    vis.textContent = thisWeek
      ? (thisWeek.visibility === 'class' ? 'shared with class' : 'private')
      : '—';
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

  const badge = document.createElement('span');
  badge.className = 'badge' + (sub.visibility === 'class' ? ' public' : '');
  badge.textContent = sub.visibility === 'class' ? 'shared with class' : 'private';
  meta.appendChild(badge);
  meta.style.display = 'flex';
  meta.style.gap = '0.8rem';
  meta.style.alignItems = 'baseline';
  meta.style.marginBottom = '0.5rem';

  card.appendChild(meta);
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
