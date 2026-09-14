// Week tabs and week formatting — shared by /instructor/, /account/ and
// /studio/.
//
// The weeks themselves always come from the API (worker/src/index.js `WEEKS`
// is the single source of truth); nothing in here hardcodes a week number,
// title or date. This file only formats what the server sent and builds the
// tab strip, so adding week 4 stays a one-line edit in the Worker.

// "Week 2 — Build something"
export function weekLabel(w) {
  return w ? `Week ${w.week} — ${w.title}` : '';
}

// "Sunday Sep 20, 11:59 PM" — the reader's local time, because the deadline
// they care about is the one on their own clock.
export function dueLabel(dueAt) {
  if (!dueAt) return '';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString(undefined, { weekday: 'long' });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${date}, ${time}`;
}

// "Sep 14, 3:02 PM" — for a submission timestamp.
export function whenLabel(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function findWeek(weeks, n) {
  return (weeks || []).find((w) => w.week === n) || null;
}

// Tabs are real links to #week-N, so they can be copied, opened in a new tab
// and survive a reload. Selection itself is driven by the hash (see
// onWeekHashChange), never by the click handler — one code path, no drift.
export function renderWeekTabs(container, weeks, selected) {
  if (!container) return;
  container.textContent = '';
  for (const w of weeks || []) {
    const a = document.createElement('a');
    a.className = 'week-tab' + (w.week === selected ? ' active' : '');
    a.href = `#week-${w.week}`;
    if (w.week === selected) a.setAttribute('aria-current', 'true');

    const n = document.createElement('span');
    n.className = 'wt-num';
    n.textContent = `Week ${w.week}`;
    a.appendChild(n);

    const t = document.createElement('span');
    t.className = 'wt-title';
    t.textContent = w.title || '';
    a.appendChild(t);

    container.appendChild(a);
  }
}

// The week named by the current URL hash, or null.
export function weekFromHash() {
  const m = /^#week-(\d+)$/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? Number(m[1]) : null;
}

export function onWeekHashChange(fn) {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  window.addEventListener('hashchange', () => {
    const week = weekFromHash();
    if (week != null) fn(week);
  });
}

// Which tab opens by default: the most recent week that is NOT the open week
// and already has work in it — that is the week being discussed in the room —
// falling back to the open week when nothing else qualifies.
export function defaultWeek(weeks, openWeek, submittedCount) {
  const done = (weeks || [])
    .filter((w) => w.week !== openWeek && submittedCount(w.week) > 0)
    .map((w) => w.week);
  if (done.length) return Math.max(...done);
  if (openWeek != null) return openWeek;
  const all = (weeks || []).map((w) => w.week);
  return all.length ? Math.max(...all) : null;
}

// "All · Week 1 · Week 2 …" filter chips for the feed and the studio wall.
// `selected` is null for All. onPick receives null or a week number.
export function renderWeekFilter(container, weeks, selected, onPick) {
  if (!container) return;
  container.textContent = '';
  const chip = (label, value) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (value === selected ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => onPick(value));
    container.appendChild(b);
  };
  chip('All', null);
  for (const w of weeks || []) chip(`Week ${w.week}`, w.week);
}
