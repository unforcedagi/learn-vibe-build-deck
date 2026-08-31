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
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

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

$('signin-form').addEventListener('submit', async (e) => {
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

$('try-again').addEventListener('click', () => {
  hide($('sent'));
  show($('signin'));
  $('email').focus();
});

$('signout').addEventListener('click', async () => {
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
  loadFeed();

  if (me.is_instructor && me.roster) {
    show($('roster-section'));
    renderRoster(me.roster);
  }
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
    list.appendChild(renderSubmission(
      { ...item, visibility: 'class' },
      { author: item.author }
    ));
  }
}

function renderRoster(roster) {
  const box = $('roster');
  box.textContent = '';
  for (const student of roster) {
    const card = document.createElement('div');
    card.className = 'card';

    const head = document.createElement('div');
    head.className = 'meta';
    const name = document.createElement('span');
    name.className = 'week';
    name.textContent = student.name;
    const email = document.createElement('span');
    email.className = 'date';
    email.textContent = student.email;
    head.appendChild(name);
    head.appendChild(email);
    card.appendChild(head);

    if (!student.submissions || student.submissions.length === 0) {
      card.appendChild(emptyNote('No submissions.'));
    } else {
      for (const sub of student.submissions) {
        card.appendChild(renderSubmission(sub, {}));
      }
    }
    box.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Submission cards
// ---------------------------------------------------------------------------

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

  const badge = document.createElement('span');
  badge.className = 'badge' + (sub.visibility === 'class' ? ' public' : '');
  badge.textContent = sub.visibility === 'class' ? 'shared with class' : 'private';
  meta.appendChild(badge);

  if (toggle) {
    const btn = document.createElement('button');
    btn.className = 'quiet';
    btn.type = 'button';
    btn.textContent = sub.visibility === 'class' ? 'Make private' : 'Share with class';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const next = sub.visibility === 'class' ? 'private' : 'class';
      const res = await postJSON(`/submissions/${sub.id}/visibility`, { visibility: next })
        .catch(() => null);
      btn.disabled = false;
      if (res && res.ok) {
        sub.visibility = next;
        badge.className = 'badge' + (next === 'class' ? ' public' : '');
        badge.textContent = next === 'class' ? 'shared with class' : 'private';
        btn.textContent = next === 'class' ? 'Make private' : 'Share with class';
        loadFeed();
      }
    });
    meta.appendChild(btn);
  }

  card.appendChild(meta);

  const body = document.createElement('div');
  body.className = 'body';
  for (const para of (sub.body || '').split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    const p = document.createElement('p');
    p.textContent = para.trim();
    body.appendChild(p);
  }
  card.appendChild(body);

  return card;
}

function emptyNote(msg) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = msg;
  return p;
}
