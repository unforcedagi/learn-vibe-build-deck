// Learn, Vibe, Build — final demos, the instructor's view.
//
// Session-gated like /instructor/: GET /instructor/demos returns 401 (no
// session) or 403 (not the instructor). Every change goes to the Worker and
// the page re-renders from the state it sends back:
//   POST /instructor/demos/move {id, day, position}  (a taken target swaps)
//   POST /instructor/demos/guest {day, position, name, title}
//   PATCH/DELETE /instructor/demos/<id>
//   POST /instructor/demos/settings {signup_open?, lock_at?}  (the flag + lock)
//   GET  /instructor/demos/export  (plain text)
// Names and titles are rendered with textContent, never as HTML.

import { API_BASE } from '../../account/config.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const TZ = 'America/Denver';

const state = { data: null, adding: null, busy: false }; // adding: "day|position" with the guest form open

const ERRORS = {
  slot_taken: 'That slot just changed. The list is up to date; try again.',
  not_found: 'That entry is gone (released or removed). The list is up to date.',
  name_required: 'A guest needs a name.',
  title_required: 'Add a one-line project title.',
  title_too_long: 'Keep the title to 100 characters.',
  name_too_long: 'Keep the name to 80 characters.',
  bad_lock_at: 'That lock time didn’t parse.',
};

async function api(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { res, data: await res.json().catch(() => ({})) };
}

async function boot() {
  let out;
  try {
    out = await api('GET', '/instructor/demos');
  } catch {
    hide($('loading')); show($('signedout'));
    return;
  }
  hide($('loading'));
  if (out.res.status === 401) { show($('signedout')); return; }
  if (out.res.status === 403) { show($('denied')); return; }
  state.data = out.data;
  show($('main'));
  wireControls();
  render();
}

// One write at a time; the page always re-renders from the server's answer.
async function change(method, path, body) {
  if (state.busy) return false;
  state.busy = true;
  setMsg('');
  try {
    const { res, data } = await api(method, path, body);
    if (data.days) state.data = data;
    else if (!res.ok) {
      const fresh = await api('GET', '/instructor/demos').catch(() => null);
      if (fresh?.data?.days) state.data = fresh.data;
    }
    if (!res.ok) setMsg(ERRORS[data.error] || `That didn’t work (${data.error || res.status}).`);
    render();
    return res.ok;
  } catch {
    setMsg('Couldn’t reach the server.');
    return false;
  } finally {
    state.busy = false;
  }
}

function setMsg(text) {
  const m = $('demo-msg');
  m.textContent = text;
  (text ? show : hide)(m);
}

// --- Denver wall time <-> ISO, whatever zone this browser is in -------------

function denverParts(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return p;
}
function denverOffsetMin(ts) {
  const p = denverParts(ts);
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ts / 60000) * 60000) / 60000);
}
function denverLocalToISO(local) { // "YYYY-MM-DDTHH:MM" in Denver
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  let ts = wall - denverOffsetMin(wall) * 60000;
  ts = wall - denverOffsetMin(ts) * 60000; // settle across a DST change
  return new Date(ts).toISOString();
}
function isoToDenverLocal(iso) {
  const p = denverParts(Date.parse(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const lockLabel = (iso) => new Date(iso).toLocaleString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
}) + ' MT';

// --- Controls: the open flag, the lock, export ------------------------------

function wireControls() {
  $('open-toggle').addEventListener('click', () => {
    const open = !state.data.settings.signup_open;
    if (open && !window.confirm('Open the demo sign-up to the class? Links appear on the home page and on every student’s account page.')) return;
    change('POST', '/instructor/demos/settings', { signup_open: open });
  });
  $('lock-save').addEventListener('click', () => {
    const v = $('lock-at').value;
    if (!v) { setMsg('Pick a date and time to lock, or press Clear.'); return; }
    change('POST', '/instructor/demos/settings', { lock_at: denverLocalToISO(v) });
  });
  $('lock-clear').addEventListener('click', () => change('POST', '/instructor/demos/settings', { lock_at: null }));
  $('export-copy').addEventListener('click', async () => {
    const text = await exportText();
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      $('export-note').textContent = 'Copied.';
    } catch {
      $('export-text').textContent = text;
      show($('export-text'));
      $('export-note').textContent = 'Couldn’t copy here; the text is below.';
    }
  });
  $('export-show').addEventListener('click', async () => {
    const pre = $('export-text');
    if (!pre.classList.contains('hidden')) { hide(pre); $('export-show').textContent = 'Show as text'; return; }
    const text = await exportText();
    if (text == null) return;
    pre.textContent = text;
    show(pre);
    $('export-show').textContent = 'Hide text';
  });
}

async function exportText() {
  try {
    const res = await fetch(`${API_BASE}/instructor/demos/export`, { credentials: 'include' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.text();
  } catch {
    setMsg('Couldn’t get the running order.');
    return null;
  }
}

function renderControls() {
  const s = state.data.settings;
  $('open-state').textContent = s.signup_open
    ? 'Open: students can sign up, and links show on the home page and their account page.'
    : 'Closed: students can’t see the sign-up and no links show. Test accounts still can.';
  $('open-toggle').textContent = s.signup_open ? 'Close sign-up' : 'Open sign-up to the class';
  $('open-toggle').className = s.signup_open ? 'quiet' : '';
  $('lock-state').textContent = !s.lock_at ? 'Not locked: students can change their slot until a night starts.'
    : s.locked ? `Locked since ${lockLabel(s.lock_at)}. Only you can change the order.`
      : `Locks ${lockLabel(s.lock_at)}. Until then students can change their slot.`;
  if (document.activeElement !== $('lock-at')) $('lock-at').value = s.lock_at ? isoToDenverLocal(s.lock_at) : '';
}

// --- The two days -------------------------------------------------------------

function render() {
  renderControls();
  const days = $('days');
  days.replaceChildren(...state.data.days.map(renderDay));
  const names = state.data.not_signed_up.map((s) => s.name);
  $('unplaced-count').textContent = `(${names.length})`;
  $('unplaced').textContent = names.length ? names.join(', ') : 'Everyone has a slot.';
}

function renderDay(day) {
  const sec = el('section', 'demo-day');
  sec.setAttribute('aria-label', day.label);
  const head = el('div', 'demo-day-head');
  head.append(el('h2', null, day.label));
  const filled = day.slots.filter((s) => s.taken).length;
  head.append(el('p', 'hint', `${day.start_label ? `Starts ${day.start_label}` : 'Start time to be confirmed'} · ${filled} of ${day.slots.length} taken`));
  sec.append(head);
  const ol = el('ol', 'demo-slots');
  for (const s of day.slots) ol.append(renderSlot(day, s));
  sec.append(ol);
  return sec;
}

function otherDay(day) {
  return state.data.days.find((d) => d.date !== day.date);
}

function renderSlot(day, s) {
  const li = el('li', 'demo-slot' + (s.taken ? ' taken' : ' open'));
  li.append(el('span', 'slot-n', String(s.position)));
  li.append(el('span', 'slot-time', s.time || ''));
  const body = el('div', 'slot-body');
  if (s.taken) {
    body.append(el('strong', 'slot-who', s.name));
    if (s.guest) body.append(el('span', 'badge', 'Guest'));
    body.append(el('span', 'slot-title', s.title));
  } else {
    body.append(el('span', 'slot-open', 'Open'));
  }
  li.append(body);
  dropTarget(li, day, s);

  const key = `${day.date}|${s.position}`;
  if (state.adding === key) {
    li.append(guestForm(day, s));
    return li;
  }
  const actions = el('div', 'slot-actions');
  if (s.taken) {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(s.id));
      e.dataTransfer.effectAllowed = 'move';
    });
    const move = (d, p) => change('POST', '/instructor/demos/move', { id: s.id, day: d, position: p });
    actions.append(iconButton('↑', `Move ${s.name} up`, s.position === 1, () => move(day.date, s.position - 1)));
    actions.append(iconButton('↓', `Move ${s.name} down`, s.position === day.slots.length, () => move(day.date, s.position + 1)));
    const other = otherDay(day);
    const free = other && other.slots.find((x) => !x.taken);
    if (other) {
      const short = other.label.split(',')[0].slice(0, 3);
      actions.append(iconButton(`→ ${short}`, `Move ${s.name} to ${other.label}`, !free, () => move(other.date, free.position)));
    }
    actions.append(iconButton('Edit', `Edit ${s.name}`, false, () => editEntry(s)));
    actions.append(iconButton('Remove', `Remove ${s.name}`, false, () => {
      if (window.confirm(`Remove ${s.name} from ${day.label}, slot ${s.position}?`)) change('DELETE', `/instructor/demos/${s.id}`);
    }));
  } else {
    actions.append(iconButton('Add guest', `Add a guest to slot ${s.position}`, false, () => { state.adding = key; render(); }));
  }
  li.append(actions);
  return li;
}

function iconButton(label, aria, disabled, onClick) {
  const b = el('button', 'quiet', label);
  b.type = 'button';
  b.disabled = disabled;
  b.setAttribute('aria-label', aria);
  b.title = aria;
  b.addEventListener('click', onClick);
  return b;
}

function dropTarget(li, day, s) {
  li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drop-target'); });
  li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drop-target');
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (id && id !== s.id) change('POST', '/instructor/demos/move', { id, day: day.date, position: s.position });
  });
}

function editEntry(s) {
  const title = window.prompt('Project title', s.title);
  if (title == null) return;
  const body = { title };
  if (s.guest) {
    const name = window.prompt('Guest name', s.name);
    if (name == null) return;
    body.name = name;
  }
  change('PATCH', `/instructor/demos/${s.id}`, body);
}

function guestForm(day, s) {
  const form = el('form', 'slot-form');
  const name = el('input');
  Object.assign(name, { name: 'name', type: 'text', required: true, maxLength: 80, placeholder: 'Guest or auditor name', autocomplete: 'off' });
  name.setAttribute('aria-label', 'Guest or auditor name');
  const title = el('input');
  Object.assign(title, { name: 'title', type: 'text', required: true, maxLength: state.data.title_max || 100, placeholder: 'Project title', autocomplete: 'off' });
  title.setAttribute('aria-label', 'Project title');
  const save = el('button', null, 'Add');
  save.type = 'submit';
  const cancel = el('button', 'quiet', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => { state.adding = null; render(); });
  form.append(name, title, save, cancel);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await change('POST', '/instructor/demos/guest', { day: day.date, position: s.position, name: name.value, title: title.value })) {
      state.adding = null;
      render();
    }
  });
  setTimeout(() => name.focus());
  return form;
}

boot();
