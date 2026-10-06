// Class board — signed-in classmates only. Never embedded in static HTML:
// every post comes from /board with the session cookie, so signed-out
// visitors (and search engines) see only the sign-in prompt.
import { API_BASE } from '../account/config.js';

const $ = (id) => document.getElementById(id);
const list = $('board-list');
const status = $('board-status');
const form = $('board-form');
const composer = $('board-composer');
const filters = $('board-filter');

const KIND_LABEL = { build: 'Build', resource: 'Resource', question: 'Question', learning: 'Learning' };
const state = { posts: [], kind: null, editing: null };

const api = (path, opts = {}) => fetch(API_BASE + path, {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  ...opts,
});

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function load() {
  let res;
  try { res = await api('/board'); } catch { return signedOut(); }
  if (res.status === 401) return signedOut();
  if (!res.ok) { status.textContent = 'The board could not load. Refresh to try again.'; return; }
  const data = await res.json();
  state.posts = data.posts || [];
  $('board-who').textContent = `Posting as ${data.me.first_name}. Only signed-in classmates can see this board.`;
  composer.hidden = false;
  filters.hidden = false;
  status.textContent = '';
  render();
}

function signedOut() {
  composer.hidden = true;
  filters.hidden = true;
  list.replaceChildren();
  const box = el('div', 'board-signin');
  box.append(el('h2', null, 'Sign in to see and post to the class board.'));
  box.append(el('p', null, 'Builds, resources, questions and things you learned, shared with classmates only. Never public.'));
  const a = el('a', 'btn', 'Sign in');
  a.href = '../account/';
  box.append(a);
  list.append(box);
  status.textContent = '';
}

function render() {
  for (const b of filters.querySelectorAll('button')) {
    const on = (b.dataset.kind || null) === state.kind;
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('active', on);
  }
  const posts = state.posts.filter((p) => !state.kind || p.kind === state.kind || p.pinned);
  list.replaceChildren();
  if (!posts.length) {
    list.append(el('p', 'hint', 'Nothing here yet. Be the first to post.'));
    return;
  }
  for (const p of posts) list.append(card(p));
}

function card(p) {
  const art = el('article', 'board-post' + (p.pinned ? ' pinned' : ''));
  const meta = el('p', 'board-meta');
  meta.append(el('span', 'board-kind', KIND_LABEL[p.kind] || p.kind));
  meta.append(el('span', null, p.from_instructor ? 'From Aaron' : p.author));
  meta.append(el('span', null, when(p.created_at)));
  art.append(meta);
  art.append(el('h3', null, p.title));
  if (p.body) {
    for (const para of p.body.split(/\n{2,}/)) art.append(el('p', 'board-body', para));
  }
  if (p.link_url) {
    const a = el('a', 'board-link', shortLink(p.link_url));
    a.href = p.link_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    art.append(a);
  }
  if (p.mine) {
    const row = el('div', 'board-actions');
    const edit = el('button', 'btn ghost small', 'Edit');
    edit.type = 'button';
    edit.onclick = () => startEdit(p);
    const del = el('button', 'btn ghost small', 'Delete');
    del.type = 'button';
    del.onclick = () => remove(p);
    row.append(edit, del);
    art.append(row);
  }
  return art;
}

function startEdit(p) {
  state.editing = p.id;
  form.kind.value = p.kind;
  form.title.value = p.title;
  form.body.value = p.body || '';
  form.link_url.value = p.link_url || '';
  $('board-submit').textContent = 'Save changes';
  $('board-cancel').hidden = false;
  composer.open = true;
  form.title.focus();
  composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  state.editing = null;
  form.reset();
  $('board-submit').textContent = 'Post to the class';
  $('board-cancel').hidden = true;
}

async function remove(p) {
  if (!confirm(`Delete “${p.title}”?`)) return;
  const res = await api(`/board/${p.id}`, { method: 'DELETE' });
  if (res.ok) {
    state.posts = state.posts.filter((x) => x.id !== p.id);
    render();
  } else {
    status.textContent = 'Could not delete that post.';
  }
}

const ERR = {
  title_required: 'Add a title.',
  title_too_long: 'Keep the title under 140 characters.',
  body_too_long: 'Keep the note under 2000 characters.',
  bad_link: 'Links need to start with https:// (a public URL, not a file on your laptop).',
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    kind: form.kind.value,
    title: form.title.value,
    body: form.body.value,
    link_url: form.link_url.value,
  };
  const btn = $('board-submit');
  btn.disabled = true;
  const res = state.editing
    ? await api(`/board/${state.editing}`, { method: 'PATCH', body: JSON.stringify(payload) })
    : await api('/board', { method: 'POST', body: JSON.stringify(payload) });
  btn.disabled = false;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $('board-form-msg').textContent = ERR[data.error] || 'Could not post. Try again.';
    return;
  }
  $('board-form-msg').textContent = state.editing ? 'Saved.' : 'Posted.';
  if (state.editing) {
    state.posts = state.posts.map((x) => (x.id === data.post.id ? data.post : x));
  } else {
    const pinned = state.posts.filter((x) => x.pinned);
    const rest = state.posts.filter((x) => !x.pinned);
    state.posts = data.post.pinned ? [data.post, ...pinned, ...rest] : [...pinned, data.post, ...rest];
  }
  resetForm();
  render();
});

$('board-cancel').addEventListener('click', resetForm);

filters.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.kind = b.dataset.kind || null;
  render();
});

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function shortLink(url) {
  try {
    const u = new URL(url);
    const s = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  } catch {
    return url;
  }
}

load();
