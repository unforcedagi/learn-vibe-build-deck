// Learn, Vibe, Build — final demo sign-up (student page).
//
// Signed-in only: GET /demos returns 401 without a session and { open: false }
// while the sign-up is closed. Everything a student writes goes through
// POST /demos/claim (claim, move or retitle their one slot) and
// DELETE /demos/claim (release). The server enforces one slot per student,
// the lock time and each day's own closing; this page only reflects them.
// Names and titles are rendered with textContent, never as HTML.

import { API_BASE } from '../account/config.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const state = { data: null, editing: null, busy: false }; // editing: "day|position" of the open inline form

const ERRORS = {
  slot_taken: 'Someone just took that slot. The list below is up to date.',
  changed: 'Your slot changed in the meantime (another tab, or Aaron moved it). The list below is up to date.',
  locked: 'The order is locked now. Ask Aaron if you need to change your slot.',
  day_closed: 'That night has started, so its slots can no longer change here. Ask Aaron.',
  not_open: 'The sign-up is closed right now.',
  title_required: 'Give your project a one-line title.',
  title_too_long: 'Keep the title to one line (100 characters).',
};

function lockLabel(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  }) + ' MT';
}

async function boot() {
  let res;
  try {
    res = await fetch(`${API_BASE}/demos`, { credentials: 'include' });
  } catch {
    hide($('loading')); show($('signedout'));
    return;
  }
  hide($('loading'));
  if (res.status === 401) { show($('signedout')); return; }
  const data = await res.json();
  if (!data.open) { show($('closed')); return; }
  state.data = data;
  show($('main'));
  render();
}

async function send(method, body) {
  if (state.busy) return;
  state.busy = true;
  setMsg('');
  try {
    const res = await fetch(`${API_BASE}/demos/claim`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (data.days) state.data = data;
    else if (!res.ok) await reload(); // locked, closed night, released elsewhere: show what is true now
    if (res.ok) state.editing = null;
    else setMsg(ERRORS[data.error] || 'That didn’t work. Reload the page and try again.');
    render();
  } catch {
    setMsg('Couldn’t reach the server. Check your connection and try again.');
  } finally {
    state.busy = false;
  }
}

async function reload() {
  try {
    const res = await fetch(`${API_BASE}/demos`, { credentials: 'include' });
    const data = await res.json();
    if (data.days) state.data = data;
  } catch { /* keep what is on screen */ }
}

function setMsg(text) {
  const m = $('demo-msg');
  m.textContent = text;
  (text ? show : hide)(m);
}

// The server decides; this only hides buttons it would refuse. A student whose
// own night has started can't move off it either.
function canChange(day) {
  const d = state.data;
  const mineClosed = d.mine && d.days.find((x) => x.date === d.mine.day)?.closed;
  return d.can_claim && !d.locked && !day.closed && !mineClosed;
}

function render() {
  const d = state.data;
  (d.preview ? show : hide)($('preview-note'));
  renderMine();
  const days = $('days');
  days.replaceChildren(...d.days.map(renderDay));
  const input = days.querySelector('input[name="title"]');
  if (input) input.focus();
}

function renderMine() {
  const d = state.data;
  const box = $('my-slot');
  box.replaceChildren();
  const lock = d.locked
    ? 'The order is locked. Ask Aaron if you need a change.'
    : d.lock_at ? `You can change or release your slot until ${lockLabel(d.lock_at)}.`
      : 'You can change or release your slot until Aaron locks the order.';
  if (d.mine) {
    const p = el('p');
    p.append('You’re presenting ', el('strong', null, `${d.mine.label}, slot ${d.mine.position}`),
      d.mine.time ? ` (about ${d.mine.time})` : '', ': ', el('em', null, d.mine.title), '.');
    box.append(p);
  } else if (d.can_claim) {
    box.append(el('p', null, 'You haven’t picked a slot yet. Choose an open one below.'));
  }
  if (d.can_claim) box.append(el('p', 'hint', lock));
}

function renderDay(day) {
  const sec = el('section', 'demo-day');
  sec.setAttribute('aria-label', day.label);
  const head = el('div', 'demo-day-head');
  head.append(el('h2', null, day.label));
  head.append(el('p', 'hint', day.start_label ? `Starts ${day.start_label} · 10 minutes each` : 'Start time to be confirmed · 10 minutes each'));
  sec.append(head);
  if (day.closed && state.data.can_claim) sec.append(el('p', 'hint', 'This night has started; its slots are set.'));
  const ol = el('ol', 'demo-slots');
  for (const s of day.slots) ol.append(renderSlot(day, s));
  sec.append(ol);
  return sec;
}

function renderSlot(day, s) {
  const d = state.data;
  const li = el('li', 'demo-slot' + (s.mine ? ' mine' : '') + (s.taken ? ' taken' : ' open'));
  li.append(el('span', 'slot-n', String(s.position)));
  li.append(el('span', 'slot-time', s.time || ''));
  const body = el('div', 'slot-body');
  if (s.taken) {
    const who = el('strong', 'slot-who', s.name);
    body.append(who);
    if (s.mine) body.append(el('span', 'badge', 'You'));
    if (s.guest) body.append(el('span', 'badge', 'Guest'));
    body.append(el('span', 'slot-title', s.title));
  } else {
    body.append(el('span', 'slot-open', 'Open'));
  }
  li.append(body);

  const key = `${day.date}|${s.position}`;
  if (state.editing === key) {
    li.append(titleForm(day, s));
    return li;
  }
  if (!canChange(day)) return li;
  const actions = el('div', 'slot-actions');
  if (s.mine) {
    actions.append(button('Edit title', 'quiet', () => { state.editing = key; render(); }));
    actions.append(button('Release', 'quiet', () => {
      if (window.confirm('Give up this slot? Someone else can take it.')) send('DELETE');
    }));
  } else if (!s.taken) {
    if (d.mine) {
      actions.append(button('Move here', 'quiet', () => send('POST', { day: day.date, position: s.position, title: d.mine.title })));
    } else {
      actions.append(button('Take this slot', 'quiet', () => { state.editing = key; render(); }));
    }
  }
  if (actions.childElementCount) li.append(actions);
  return li;
}

function button(label, cls, onClick) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// Inline form: the project title, for a new claim or an edit of their own slot.
function titleForm(day, s) {
  const d = state.data;
  const form = el('form', 'slot-form');
  const label = el('label', 'visually-hidden', 'Project title');
  const id = `title-${day.date}-${s.position}`;
  label.htmlFor = id;
  const input = el('input');
  Object.assign(input, { id, name: 'title', type: 'text', required: true, maxLength: d.title_max || 100,
    placeholder: 'Your project, in one line', autocomplete: 'off' });
  input.value = d.mine?.title || '';
  const save = el('button', null, s.mine ? 'Save title' : 'Claim slot');
  save.type = 'submit';
  const cancel = button('Cancel', 'quiet', () => { state.editing = null; render(); });
  form.append(label, input, save, cancel);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send('POST', { day: day.date, position: s.position, title: input.value });
  });
  return form;
}

boot();
