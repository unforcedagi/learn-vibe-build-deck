// Learn, Vibe, Build — student account page.
//
// Flow: enter your Canvas email -> the accounts Worker emails a magic link ->
// the link hits api.learnvibe.build/auth/callback, which sets an HttpOnly
// session cookie and redirects back here -> we call /me and render.
//
// The cookie is scoped to .learnvibe.build, so every fetch below uses
// credentials: 'include' and just works cross-origin (same-site).
//
// The signed-in view is one tab per week (weeks come from the API; nothing
// here hardcodes a week number). The open week shows the submission form; a
// past week shows what you turned in, read-only, with the two share
// checkboxes still yours to change.

import { API_BASE } from './config.js';
import {
  weekLabel, dueLabel, whenLabel, findWeek,
  renderWeekTabs, weekFromHash, onWeekHashChange, renderWeekFilter,
} from '../assets/weeks.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');

// Attach a listener only if the element exists. A stale cached index.html can
// briefly disagree with this file about which elements are on the page; a
// missing one must degrade to a dead button, not kill the whole module.
const on = (id, event, fn) => {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
};

const api = (path, opts = {}) =>
  fetch(API_BASE + path, { credentials: 'include', ...opts });

const postJSON = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// One /me payload, one selected week, one feed filter.
const state = {
  me: null,
  weeks: [],
  openWeek: null,
  week: null,
  feed: [],
  feedWeek: null, // null = All
};

// ---------------------------------------------------------------------------
// Boot: surface a failed link, then ask the API who we are.
// ---------------------------------------------------------------------------

async function boot() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const linkError = hashParams.get('error');
  if (linkError) {
    history.replaceState(null, '', window.location.pathname);
  }

  let me = null;
  try {
    const res = await api('/me');
    if (res.ok) me = await res.json();
  } catch {
    /* network trouble — fall through to the sign-in form */
  }

  if (me) {
    showAccount(me);
  } else {
    show($('signin'));
    if (linkError === 'expired') {
      showSigninError('That sign-in link expired or was already used — request a fresh one below.');
    }
  }
}

boot();

// ---------------------------------------------------------------------------
// Sign-in form
// ---------------------------------------------------------------------------

on('signin-form', 'submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  if (!email) return;

  $('send-btn').disabled = true;
  hide($('signin-error'));

  let res;
  try {
    res = await postJSON('/auth/request', { email });
  } catch {
    $('send-btn').disabled = false;
    showSigninError('Couldn’t reach the accounts server — try again in a moment.');
    return;
  }
  $('send-btn').disabled = false;

  if (res.ok) {
    $('sent-to').textContent = email;
    hide($('signin'));
    show($('sent'));
    return;
  }

  const body = await res.json().catch(() => ({}));
  if (res.status === 404 || body.error === 'not_on_roster') {
    showSigninError('That email isn’t on the class roster — use the email on your Canvas account.');
  } else if (res.status === 429) {
    showSigninError('Too many emails just now — wait a few minutes and try again.');
  } else {
    showSigninError('Couldn’t send the link — try again, or tell Aaron.');
  }
});

on('try-again', 'click', () => {
  hide($('sent'));
  show($('signin'));
  $('email').focus();
});

on('signout', 'click', async () => {
  try {
    await postJSON('/auth/logout', {});
  } finally {
    hide($('account'));
    hide($('sent'));
    show($('signin'));
  }
});

function showSigninError(msg) {
  const el = $('signin-error');
  el.textContent = msg;
  show(el);
}

// ---------------------------------------------------------------------------
// Signed-in view
// ---------------------------------------------------------------------------

function showAccount(me) {
  hide($('signin'));
  hide($('sent'));
  show($('account'));

  state.me = me;
  state.weeks = (me.weeks || []).filter((w) => w.week <= (me.open_week ?? w.week));
  state.openWeek = me.open_week ?? null;

  $('student-name').textContent = me.name || me.email || 'Student';
  $('student-email').textContent = me.email || '';

  // The instructor gets a pointer to their own view; this page stays the
  // student page for everyone (the roster lives at /instructor/ now).
  if (me.is_instructor) showInstructorLink();

  const wanted = weekFromHash();
  selectWeek(findWeek(state.weeks, wanted) ? wanted : state.openWeek);
  onWeekHashChange((week) => {
    if (findWeek(state.weeks, week)) selectWeek(week);
  });

  setupSubmitForm();
  loadFeed();
}

// Prominent pointer to the dedicated instructor view (only ever rendered for
// an instructor session — the page itself re-checks server-side anyway).
function showInstructorLink() {
  if (document.getElementById('instructor-link')) return;
  const box = document.createElement('div');
  box.id = 'instructor-link';
  box.className = 'banner';
  const strong = document.createElement('strong');
  const a = document.createElement('a');
  a.href = '../instructor/';
  a.textContent = 'Open the instructor view →';
  strong.appendChild(a);
  box.appendChild(strong);
  box.appendChild(document.createTextNode(' Week tabs, the roster, and the weekly reads.'));
  const account = $('account');
  account.insertBefore(box, account.firstChild);
}

function mySub(week) {
  return (state.me?.submissions || []).find((s) => s.week === week) || null;
}

function selectWeek(week) {
  state.week = week;
  renderWeekTabs($('week-tabs'), state.weeks, week);
  renderWeekStatus();

  const panel = $('week-panel');
  panel.textContent = '';

  if (week === state.openWeek) {
    show($('submit-form'));
    fillSubmitForm(mySub(week));
  } else {
    hide($('submit-form'));
    panel.appendChild(pastWeekCard(week, mySub(week)));
  }
}

// "Week 3 — Three different tools · due Sunday Sep 20, 11:59 PM" plus the
// week's one-line prompt, both straight from the API.
function renderWeekStatus() {
  const box = $('week-status');
  if (!box) return;
  box.textContent = '';
  const w = findWeek(state.weeks, state.week);
  if (!w) return;

  const line = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = weekLabel(w);
  line.appendChild(title);

  const due = dueLabel(w.due_at);
  if (due) {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    line.appendChild(sep);
    line.appendChild(document.createTextNode(`due ${due}`));
  }
  box.appendChild(line);

  if (w.prompt) {
    const p = document.createElement('span');
    p.style.display = 'block';
    p.textContent = w.prompt;
    box.appendChild(p);
  }

  if (w.canvas_url) {
    const a = document.createElement('a');
    a.href = w.canvas_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Open on Canvas →';
    a.style.display = 'inline-block';
    box.appendChild(a);
  }
}

// ---------------------------------------------------------------------------
// A past week — read-only body and link, share flags still editable.
// ---------------------------------------------------------------------------

function pastWeekCard(week, sub) {
  if (!sub) {
    const card = document.createElement('div');
    card.className = 'card readonly';
    card.appendChild(emptyNote(
      `You didn't submit week ${week} on the site. That week is closed here — talk to Aaron if you need it counted.`));
    return card;
  }

  const card = document.createElement('div');
  card.className = 'card readonly';

  if (sub.submitted_at) {
    const when = document.createElement('p');
    when.className = 'field-label';
    when.textContent = `Submitted ${whenLabel(sub.submitted_at)}`;
    card.appendChild(when);
  }

  if (sub.link_url) {
    const label = document.createElement('p');
    label.className = 'field-label';
    label.textContent = 'Your build';
    card.appendChild(label);
    const p = document.createElement('p');
    p.style.margin = '0 0 0.9rem';
    const a = document.createElement('a');
    a.href = sub.link_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = sub.link_url;
    p.appendChild(a);
    card.appendChild(p);
  }

  const wlabel = document.createElement('p');
  wlabel.className = 'field-label';
  wlabel.textContent = 'Your writing';
  card.appendChild(wlabel);
  card.appendChild(markdownBody(sub.body));

  const shares = document.createElement('div');
  shares.style.display = 'flex';
  shares.style.gap = '1.5rem';
  shares.style.flexWrap = 'wrap';
  shares.style.marginTop = '1rem';
  if (sub.link_url) {
    shares.appendChild(shareCheckbox(sub, 'build', 'Share my build with the class'));
  }
  shares.appendChild(shareCheckbox(sub, 'writing', 'Share my writing with the class'));
  card.appendChild(shares);

  return card;
}

// A closed week's body and link are fixed, but sharing is a standing choice —
// POST /submissions/:id/share updates one flag on an existing row regardless
// of which week it belongs to.
function shareCheckbox(sub, field, label) {
  const wrap = document.createElement('label');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '0.4rem';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = field === 'build' ? !!sub.share_build : writingIsShared(sub);
  box.addEventListener('change', async () => {
    const next = box.checked;
    box.disabled = true;
    const res = await postJSON(`/submissions/${sub.id}/share`, { field, value: next })
      .catch(() => null);
    box.disabled = false;
    if (res && res.ok) {
      if (field === 'build') sub.share_build = next; else sub.share_writing = next;
      loadFeed();
    } else {
      box.checked = !next; // the server said no — don't lie about the state
    }
  });
  wrap.appendChild(box);
  wrap.appendChild(document.createTextNode(label));
  return wrap;
}

// ---------------------------------------------------------------------------
// Weekly submission form (build link + writing, two independent share flags)
// ---------------------------------------------------------------------------

const MIN_WRITING_CHARS = 120; // mirrors the server-side floor

function fillSubmitForm(existing) {
  $('submit-link').value = existing?.link_url || '';
  $('submit-writing').value = existing?.body || '';
  $('share-build').checked = !!existing?.share_build;
  $('share-writing').checked = !!existing?.share_writing;
  $('submit-btn').textContent = existing ? 'Update submission' : 'Submit';
  $('submit-status').textContent = existing?.submitted_at
    ? `Last saved ${whenLabel(existing.submitted_at)}`
    : '';
  hide($('submit-error'));
}

function setupSubmitForm() {
  on('submit-form', 'submit', async (e) => {
    e.preventDefault();
    hide($('submit-error'));

    const week = state.openWeek;
    const linkUrl = $('submit-link').value.trim();
    const writing = $('submit-writing').value.trim();
    if (writing.length < MIN_WRITING_CHARS) {
      showSubmitError(`A bit more, please — one paragraph minimum (${writing.length}/${MIN_WRITING_CHARS} characters).`);
      return;
    }

    const btn = $('submit-btn');
    btn.disabled = true;
    let res;
    try {
      res = await postJSON('/submissions', {
        week,
        link_url: linkUrl,
        body: writing,
        share_build: $('share-build').checked,
        share_writing: $('share-writing').checked,
      });
    } catch {
      btn.disabled = false;
      showSubmitError('Couldn’t reach the accounts server — try again in a moment.');
      return;
    }
    btn.disabled = false;

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      if (errBody.error === 'bad_link') showSubmitError('That doesn’t look like a URL — include https://');
      else if (errBody.error === 'writing_too_short') showSubmitError('A bit more, please — one paragraph minimum.');
      else showSubmitError('Couldn’t save — try again, or tell Aaron.');
      return;
    }

    const { submission } = await res.json();
    btn.textContent = 'Update submission';
    $('submit-status').textContent = `Saved ${whenLabel(submission.submitted_at)}`;

    state.me.submissions = [
      ...(state.me.submissions || []).filter((s) => s.week !== week),
      submission,
    ];
    loadFeed();
  });
}

function showSubmitError(msg) {
  const el = $('submit-error');
  el.textContent = msg;
  show(el);
}

// ---------------------------------------------------------------------------
// Class feed — everything shared with the class, filterable by week.
// ---------------------------------------------------------------------------

async function loadFeed() {
  const list = $('feed');
  list.textContent = '';
  let res;
  try {
    res = await api('/feed');
  } catch {
    list.appendChild(emptyNote('Couldn’t load the class feed.'));
    return;
  }
  if (!res.ok) {
    list.appendChild(emptyNote('Couldn’t load the class feed.'));
    return;
  }
  const data = await res.json();
  state.feed = data.feed || [];
  if (!state.weeks.length && data.weeks) state.weeks = data.weeks;
  drawFeedFilter();
  renderFeed();
}

function drawFeedFilter() {
  renderWeekFilter($('feed-filter'), state.weeks, state.feedWeek, (week) => {
    state.feedWeek = week;
    drawFeedFilter();
    renderFeed();
  });
}

function renderFeed() {
  const list = $('feed');
  list.textContent = '';
  const items = state.feedWeek == null
    ? state.feed
    : state.feed.filter((i) => i.week === state.feedWeek);

  if (items.length === 0) {
    list.appendChild(emptyNote(state.feedWeek == null
      ? 'Nothing shared with the class yet. Sharing a submission puts it here.'
      : `Nothing shared for week ${state.feedWeek} yet.`));
    return;
  }
  for (const item of items) {
    list.appendChild(renderSubmission(item, { author: item.author }));
  }
}

// ---------------------------------------------------------------------------
// Submission cards (the class feed)
// ---------------------------------------------------------------------------

// Week-1 Canvas rows never set share_writing explicitly; fall back to the
// legacy `visibility` field so both old and new shapes render correctly.
function writingIsShared(sub) {
  return sub.share_writing !== undefined ? !!sub.share_writing : sub.visibility === 'class';
}

function renderSubmission(sub, { author = null } = {}) {
  const card = document.createElement('div');
  card.className = 'card submission';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const week = document.createElement('span');
  week.className = 'week';
  week.textContent = author ? `${author} — Week ${sub.week}` : `Week ${sub.week}`;
  meta.appendChild(week);

  if (sub.submitted_at) {
    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = new Date(sub.submitted_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    meta.appendChild(date);
  }

  card.appendChild(meta);

  if (sub.link_url && sub.share_build) {
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

  if (writingIsShared(sub)) card.appendChild(markdownBody(sub.body));

  return card;
}

// Bodies are markdown (converted from Canvas HTML server-side). Render with
// marked, then sanitize with DOMPurify before it touches the DOM — never
// inject unsanitized output. Both libraries are pinned + SRI'd in index.html.
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
