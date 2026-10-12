// Class board — signed-in classmates only. Never embedded in static HTML:
// every post comes from /board with the session cookie, so signed-out
// visitors (and search engines) see only the sign-in prompt.
import { API_BASE } from '../account/config.js';
import { linkSegments } from './linkify.js';

const $ = (id) => document.getElementById(id);
const list = $('board-list');
const status = $('board-status');
const form = $('board-form');
const composer = $('board-composer');
const filters = $('board-filter');

const KIND_LABEL = { build: 'Build', resource: 'Resource', question: 'Question', learning: 'Learning' };
const state = { posts: [], kind: null, editing: null, open: new Set(), scope: 'class', podId: null, pods: null, me: null };
const tabs = $('board-tabs');
const podPanel = $('board-pod');

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
  const q = state.scope === 'pod' ? `?scope=pod${state.podId ? `&pod_id=${state.podId}` : ''}` : '';
  try { res = await api('/board' + q); } catch { return signedOut(); }
  if (res.status === 401) return signedOut();
  if (state.scope === 'pod' && (res.status === 404 || res.status === 400)) {
    // Not in a pod (or instructor with none picked yet): show the panel, no posts.
    state.posts = [];
    await loadPods();
    showChrome();
    status.textContent = '';
    render();
    return;
  }
  if (!res.ok) { status.textContent = 'The board could not load. Refresh to try again.'; return; }
  const data = await res.json();
  state.posts = data.posts || [];
  state.me = data.me;
  if (data.pod) state.podId = data.pod.id;
  if (!state.pods) await loadPods();
  showChrome();
  status.textContent = '';
  render();
}

async function loadPods() {
  try {
    const r = await api('/me/pod');
    if (r.ok) state.pods = await r.json();
  } catch { /* the class board still works without pod info */ }
  state.pods = state.pods || { current: null, past: [] };
  if (state.me && state.me.is_instructor && state.scope === 'pod' && !state.podId && state.pods.pods && state.pods.pods.length) {
    state.podId = state.pods.pods[0].id;
    state.reload = true;
  }
}

function showChrome() {
  if (state.reload) { state.reload = false; load(); return; }
  const inst = state.me && state.me.is_instructor;
  const pods = state.pods || { current: null, past: [] };
  const hasPod = !!pods.current || (inst && (pods.pods || []).length > 0);
  $('board-who').textContent = `Posting as ${state.me.first_name}. ${state.scope === 'pod' ? 'Only your pod and Aaron can see the pod board.' : 'Only signed-in classmates can see this board.'}`;
  composer.hidden = false;
  filters.hidden = false;
  tabs.hidden = !(hasPod || pods.past.length);
  for (const b of tabs.querySelectorAll('button')) {
    const on = b.dataset.scope === state.scope;
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('active', on);
  }
  tabs.querySelector('[data-scope="pod"]').textContent = inst ? 'Pods' : 'My pod';
  const shareOpt = $('board-share-pod');
  shareOpt.textContent = inst ? 'A pod (pick below)' : (pods.current ? `My pod (${pods.current.name})` : 'My pod');
  shareOpt.disabled = !hasPod;
  if (state.scope === 'pod' && hasPod && !state.editing) form.share.value = 'pod';
  syncSubmitLabel();
  renderPodPanel(pods, inst);
}

function renderPodPanel(pods, inst) {
  podPanel.hidden = state.scope !== 'pod';
  if (podPanel.hidden) return;
  const pick = $('board-pod-pick');
  const past = $('board-pod-past');
  const title = $('board-pod-title');
  const members = $('board-pod-members');
  pick.hidden = $('board-pod-pick-label').hidden = !inst;
  past.replaceChildren();
  past.hidden = !pods.past.length;
  if (pods.past.length) {
    past.append(document.createTextNode('Earlier pods: '));
    for (const p of pods.past) {
      const b = el('button', 'quiet', `${p.name} (${p.set_name})`);
      b.type = 'button';
      b.onclick = () => { state.podId = p.id; load(); };
      past.append(b);
    }
  }
  if (inst) {
    pick.replaceChildren(...(pods.pods || []).map((p) => {
      const o = el('option', null, `${p.name} · ${p.members.join(', ')}`);
      o.value = p.id;
      return o;
    }));
    const known = (pods.pods || []).some((p) => p.id === state.podId);
    if (known) pick.value = String(state.podId);
    const cur = (pods.pods || []).find((p) => p.id === state.podId);
    title.textContent = cur ? `${cur.name} · ${cur.set_name}` : 'Pod history';
    members.textContent = cur ? cur.members.join(', ') : '';
    return;
  }
  const cur = pods.current;
  const viewing = cur && cur.id === state.podId ? cur : null;
  if (viewing) {
    title.textContent = `${viewing.name} · ${viewing.set_name}`;
    members.textContent = `In this pod: ${viewing.members.join(', ')}`;
  } else {
    const old = pods.past.find((p) => p.id === state.podId);
    title.textContent = old ? `${old.name} · ${old.set_name} (earlier pod)` : 'No pod right now';
    members.textContent = old ? 'Read-only history of an earlier pod.' : 'You are not in a pod at the moment. Earlier pods are below.';
  }
}

function signedOut() {
  composer.hidden = true;
  filters.hidden = true;
  tabs.hidden = true;
  podPanel.hidden = true;
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
    list.append(el('p', 'hint', state.scope === 'pod' ? 'Nothing in this pod board yet.' : 'Nothing here yet. Be the first to post.'));
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
    for (const para of p.body.split(/\n{2,}/)) art.append(richText('p', 'board-body', para));
  }
  if (p.link_url) {
    const a = el('a', 'board-link', shortLink(p.link_url));
    a.href = p.link_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    art.append(a);
  }
  art.append(commentsBlock(p));
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
  form.share.value = p.pod_id ? 'pod' : 'class';
  form.share.disabled = true;
  $('board-submit').textContent = 'Save changes';
  $('board-cancel').hidden = false;
  composer.open = true;
  form.title.focus();
  composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncSubmitLabel() {
  $('board-submit').textContent = state.editing ? 'Save changes' : (form.share.value === 'pod' ? 'Post to the pod' : 'Post to the class');
}

function resetForm() {
  state.editing = null;
  form.reset();
  form.share.disabled = false;
  form.share.value = state.scope;
  syncSubmitLabel();
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
  const toPod = !state.editing && form.share.value === 'pod';
  if (toPod) {
    payload.pod = true;
    if (state.me && state.me.is_instructor) {
      payload.pod_id = state.podId || (state.pods && state.pods.pods && state.pods.pods[0] && state.pods.pods[0].id);
    }
  }
  const btn = $('board-submit');
  btn.disabled = true;
  const res = state.editing
    ? await api(`/board/${state.editing}`, { method: 'PATCH', body: JSON.stringify(payload) })
    : await api('/board', { method: 'POST', body: JSON.stringify(payload) });
  btn.disabled = false;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    $('board-form-msg').textContent = ERR[data.error] || (data.error === 'no_pod' ? 'You are not in a pod right now.' : 'Could not post. Try again.');
    return;
  }
  $('board-form-msg').textContent = state.editing ? 'Saved.' : 'Posted.';
  if (!state.editing && toPod !== (state.scope === 'pod')) {
    // Posted to the other board: follow it there.
    state.scope = toPod ? 'pod' : 'class';
    if (toPod && data.post.pod_id) state.podId = data.post.pod_id;
    resetForm();
    await load();
    return;
  }
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

tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.scope === state.scope) return;
  state.scope = b.dataset.scope;
  if (state.scope === 'class') { state.podId = null; } else if (state.pods && state.pods.current) { state.podId = state.pods.current.id; }
  state.posts = [];
  resetForm();
  load();
});

$('board-pod-pick').addEventListener('change', (e) => {
  state.podId = Number(e.target.value);
  load();
});

form.share.addEventListener('change', syncSubmitLabel);

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

// Plain text with autolinked http(s) URLs. Text goes in via textContent;
// links are <a> elements with a validated href. No HTML is ever parsed.
function richText(tag, cls, text) {
  const n = el(tag, cls);
  for (const seg of linkSegments(text)) {
    if (seg.href) {
      const a = el('a', null, seg.text);
      a.href = seg.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      n.append(a);
    } else {
      n.append(document.createTextNode(seg.text));
    }
  }
  return n;
}

function commentsBlock(p) {
  const comments = p.comments || [];
  const d = el('details', 'board-comments');
  d.open = state.open.has(p.id);
  d.addEventListener('toggle', () => { if (d.open) state.open.add(p.id); else state.open.delete(p.id); });
  const n = comments.length;
  d.append(el('summary', null, n ? `${n} comment${n === 1 ? '' : 's'}` : 'Comment'));
  const list = el('ul', 'board-comment-list');
  for (const c of comments) list.append(commentItem(p, c));
  d.append(list);

  const f = document.createElement('form');
  f.className = 'board-comment-form';
  const ta = el('textarea');
  ta.name = 'body';
  ta.rows = 2;
  ta.maxLength = 1000;
  ta.required = true;
  ta.placeholder = 'Add a comment for the class';
  ta.setAttribute('aria-label', `Comment on ${p.title}`);
  const btn = el('button', 'btn small', 'Comment');
  btn.type = 'submit';
  const msg = el('span', 'hint');
  msg.setAttribute('role', 'status');
  f.append(ta, btn, msg);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    const res = await api(`/board/${p.id}/comments`, { method: 'POST', body: JSON.stringify({ body: ta.value }) });
    btn.disabled = false;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { msg.textContent = data.error === 'comment_too_long' ? 'Keep it under 1000 characters.' : 'Could not post the comment.'; return; }
    p.comments = [...(p.comments || []), data.comment];
    state.open.add(p.id);
    render();
  });
  d.append(f);
  return d;
}

function commentItem(p, c) {
  const li = el('li', 'board-comment' + (c.from_instructor ? ' from-instructor' : ''));
  const meta = el('p', 'board-meta');
  meta.append(el('span', c.from_instructor ? 'board-kind' : null, c.from_instructor ? 'From Aaron' : c.author));
  meta.append(el('span', null, whenTime(c.created_at) + (c.updated_at !== c.created_at ? ' · edited' : '')));
  li.append(meta);
  li.append(richText('p', 'board-comment-body', c.body));
  if (c.mine || c.can_delete) {
    const row = el('div', 'board-actions');
    if (c.mine) {
      const edit = el('button', 'quiet', 'Edit');
      edit.type = 'button';
      edit.onclick = async () => {
        const next = prompt('Edit your comment', c.body);
        if (next == null || !next.trim()) return;
        const res = await api(`/board/comments/${c.id}`, { method: 'PATCH', body: JSON.stringify({ body: next }) });
        if (res.ok) { const d = await res.json(); p.comments = p.comments.map((x) => (x.id === c.id ? d.comment : x)); render(); }
      };
      row.append(edit);
    }
    const del = el('button', 'quiet', c.mine ? 'Delete' : 'Remove');
    del.type = 'button';
    del.onclick = async () => {
      if (!confirm('Delete this comment?')) return;
      const res = await api(`/board/comments/${c.id}`, { method: 'DELETE' });
      if (res.ok) { p.comments = p.comments.filter((x) => x.id !== c.id); render(); }
    };
    row.append(del);
    li.append(row);
  }
  return li;
}

function whenTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

load();
