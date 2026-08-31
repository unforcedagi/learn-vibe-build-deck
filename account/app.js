// Learn, Vibe, Build — student account page.
//
// Flow: enter your Canvas email -> the accounts Worker emails a magic link ->
// the link hits api.learnvibe.build/auth/callback, which sets an HttpOnly
// session cookie and redirects back here -> we call /me and render.
//
// The cookie is scoped to .learnvibe.build, so every fetch below uses
// credentials: 'include' and just works cross-origin (same-site).

import { API_BASE } from './config.js';

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

  // Layout preview with fake data only — never grants access to real data.
  // A signed-in instructor sees the real thing regardless of this flag.
  const preview = new URLSearchParams(window.location.search).get('preview');
  if (!me && preview === 'instructor') {
    showAccount(mockInstructorMe());
    const note = document.createElement('p');
    note.className = 'preview-note';
    note.textContent = 'Layout preview — sample data only. Sign in to see the real dashboard.';
    $('account').prepend(note);
    return;
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

  $('student-name').textContent = me.name || me.email || 'Student';
  $('student-email').textContent = me.email || '';

  renderSubmissions(me.submissions || []);
  if (!me.__mock) loadFeed();
  if (me.open_week) setupSubmitForm(me);

  // The dashboard must never take the rest of the page down with it.
  if (me.is_instructor && me.roster) {
    try {
      showInstructorLink();
      show($('dashboard'));
      renderDashboard(me.roster);
    } catch (err) {
      console.error('dashboard render failed:', err);
    }
  }
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
  box.appendChild(document.createTextNode(' Weekly reads, class synthesis, and the full roster.'));
  const account = $('account');
  account.insertBefore(box, account.firstChild);
}

function renderSubmissions(submissions) {
  const list = $('submissions');
  list.textContent = '';

  if (submissions.length === 0) {
    list.appendChild(emptyNote('No submissions yet.'));
    return;
  }
  for (const sub of submissions) {
    list.appendChild(renderSubmission(sub, { toggle: true }));
  }
}

// ---------------------------------------------------------------------------
// Weekly submission form (build link + writing, two independent share flags)
// ---------------------------------------------------------------------------

const MIN_WRITING_CHARS = 120; // mirrors the server-side floor

function setupSubmitForm(me) {
  const title = $('submit-section-title');
  if (title) title.textContent = `Week ${me.open_week}'s submission`;

  const existing = (me.submissions || []).find((s) => s.week === me.open_week) || null;
  if (existing) {
    $('submit-link').value = existing.link_url || '';
    $('submit-writing').value = existing.body || '';
    $('share-build').checked = !!existing.share_build;
    $('share-writing').checked = !!existing.share_writing;
    $('submit-btn').textContent = 'Update submission';
    $('submit-status').textContent = existing.submitted_at
      ? `Last saved ${new Date(existing.submitted_at).toLocaleString()}`
      : '';
  }

  on('submit-form', 'submit', async (e) => {
    e.preventDefault();
    hide($('submit-error'));

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
        week: me.open_week,
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
    $('submit-status').textContent = `Saved ${new Date(submission.submitted_at).toLocaleString()}`;

    me.submissions = [
      ...(me.submissions || []).filter((s) => s.week !== me.open_week),
      submission,
    ];
    renderSubmissions(me.submissions);
    loadFeed();
  });
}

function showSubmitError(msg) {
  const el = $('submit-error');
  el.textContent = msg;
  show(el);
}

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
  const { feed } = await res.json();
  if (!feed || feed.length === 0) {
    list.appendChild(emptyNote('Nothing shared with the class yet. Sharing a submission puts it here.'));
    return;
  }
  for (const item of feed) {
    list.appendChild(renderSubmission(item, { author: item.author }));
  }
}

// ---------------------------------------------------------------------------
// Instructor dashboard
// ---------------------------------------------------------------------------

const CURRENT_WEEK = 1;

function renderDashboard(roster) {
  renderDashStats(roster);
  renderDashRows(roster);
}

function renderDashStats(roster) {
  const total = roster.length;
  const submitted = roster.filter((s) =>
    (s.submissions || []).some((sub) => sub.week === CURRENT_WEEK)).length;
  const signedIn = roster.filter((s) => s.signed_in).length;

  const box = $('dash-stats');
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
  box.appendChild(stat(`${submitted} of ${total}`, `submitted week ${CURRENT_WEEK}`));
  box.appendChild(dot());
  box.appendChild(stat(signedIn, 'signed in so far'));
}

function renderDashRows(roster) {
  const tbody = $('dash-rows');
  tbody.textContent = '';

  for (const student of roster) {
    const subs = student.submissions || [];
    const week1 = subs.find((s) => s.week === CURRENT_WEEK) || null;

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
    if (week1) {
      status.className = 'status-ok';
      status.textContent = 'submitted ';
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = week1.submitted_at
        ? new Date(week1.submitted_at).toLocaleDateString(undefined, {
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
    vis.textContent = week1 ? (week1.visibility === 'class' ? 'shared with class' : 'private') : '—';
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
  // Close any other open detail first.
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
    for (const sub of subs) {
      td.appendChild(renderSubmission(sub, {}));
    }
  }
  detail.appendChild(td);
  tr.after(detail);
}

on('dash-refresh', 'click', async () => {
  const btn = $('dash-refresh');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  try {
    const res = await api('/me');
    if (res.ok) {
      const me = await res.json();
      if (me.is_instructor && me.roster) renderDashboard(me.roster);
    }
  } catch {
    /* leave the current view in place */
  }
  btn.disabled = false;
  btn.textContent = 'Refresh';
});

// Fake data so the dashboard layout can be previewed without a session.
function mockInstructorMe() {
  const mk = (name, i, opts = {}) => ({
    name,
    email: `sample${i}@colorado.edu`,
    signed_in: !!opts.signed_in,
    submissions: opts.submitted
      ? [{
          id: 9000 + i, week: 1,
          body: '# Sample submission\n\nThis is **sample markdown** with a list:\n\n- one\n- two\n\nAnd a [link](https://cu.learnvibe.build).',
          submitted_at: '2026-08-30T18:00:00Z',
          visibility: i % 2 ? 'private' : 'class',
        }]
      : [],
  });
  return {
    __mock: true,
    name: 'Preview',
    email: 'preview@example.com',
    is_instructor: true,
    submissions: [],
    roster: [
      mk('Ada Lovelace', 1, { submitted: true, signed_in: true }),
      mk('Grace Hopper', 2, { submitted: true }),
      mk('Alan Turing', 3, { signed_in: true }),
      mk('Katherine Johnson', 4, {}),
    ],
  };
}

// ---------------------------------------------------------------------------
// Submission cards
// ---------------------------------------------------------------------------

// Week-1 Canvas rows never set share_build/share_writing explicitly in the
// mock preview data; fall back to the legacy `visibility` field so both old
// and new shapes render correctly.
function writingIsShared(sub) {
  return sub.share_writing !== undefined ? !!sub.share_writing : sub.visibility === 'class';
}

function renderSubmission(sub, { toggle = false, author = null } = {}) {
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

  const hasLink = !!sub.link_url;
  if (hasLink) meta.appendChild(shareToggle(sub, 'build', 'Build', toggle));
  meta.appendChild(shareToggle(sub, 'writing', 'Writing', toggle));

  card.appendChild(meta);

  if (hasLink) {
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

// One badge + optional toggle button for a single share flag (build or
// writing) — the two flags are independent, so each gets its own pair.
function shareToggle(sub, field, label, toggle) {
  const wrap = document.createElement('span');
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'baseline';
  wrap.style.gap = '0.4rem';

  const shared = field === 'build' ? !!sub.share_build : writingIsShared(sub);
  const badge = document.createElement('span');
  badge.className = 'badge' + (shared ? ' public' : '');
  badge.textContent = `${label}: ${shared ? 'shared' : 'private'}`;
  wrap.appendChild(badge);

  if (toggle) {
    const btn = document.createElement('button');
    btn.className = 'quiet';
    btn.type = 'button';
    btn.textContent = shared ? 'Make private' : 'Share';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const next = !shared;
      const res = await postJSON(`/submissions/${sub.id}/share`, { field, value: next })
        .catch(() => null);
      btn.disabled = false;
      if (res && res.ok) {
        if (field === 'build') sub.share_build = next; else sub.share_writing = next;
        badge.className = 'badge' + (next ? ' public' : '');
        badge.textContent = `${label}: ${next ? 'shared' : 'private'}`;
        btn.textContent = next ? 'Make private' : 'Share';
        loadFeed();
      }
    });
    wrap.appendChild(btn);
  }

  return wrap;
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
