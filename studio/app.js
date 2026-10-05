// The Studio — live wall.
//
// Sourced from the same feed the account page reads: submissions where a
// student checked "share my build with the class" (share_build=1). Signed
// in only — that checkbox's copy promises the class, not the public
// internet, so the wall honors the same audience as /feed rather than
// broadening it. No student work is embedded in the static page.
//
// The week filter is client-side over the one /feed payload. "All" shows one
// tile per builder (their most recent shared build); a specific week shows
// that week's builds, so the wall can be replayed week by week.

import { API_BASE } from '../account/config.js';
import { renderWeekFilter } from '../assets/weeks.js';

const wall = document.getElementById('wall');
const hint = document.getElementById('wall-hint');
const filterBox = document.getElementById('wall-filter');

// Loading placeholders are replaced, never treated as gallery entries.
const staticTiles = wall ? [...wall.children].filter((tile) => !tile.hasAttribute('data-wall-placeholder')) : [];

const state = { builds: [], weeks: [], week: null }; // week null = All

const api = (path) => fetch(API_BASE + path, { credentials: 'include' });

async function loadWall() {
  let res;
  try {
    res = await api('/feed');
  } catch {
    renderSignedOut();
    return;
  }
  if (!res.ok) { renderSignedOut(); return; }

  const data = await res.json();
  state.builds = (data.feed || []).filter((item) => item.share_build && item.link_url);
  state.weeks = data.weeks || [];

  drawFilter();
  renderTiles();
  hint.remove();
}

function drawFilter() {
  renderWeekFilter(filterBox, state.weeks, state.week, (week) => {
    state.week = week;
    drawFilter();
    renderTiles();
  });
}

function renderSignedOut() {
  clearWall();
  wall.appendChild(galleryNotice('A class-only gallery', 'Behind every build, a new possibility.',
    'Sign in to explore the builds your classmates chose to share. Your own work stays private until you decide otherwise.',
    'Sign in to the studio'));
  hint.remove();
}

function galleryNotice(kicker, title, description, action) {
  const notice = document.createElement('div');
  notice.className = 'gallery-empty';
  const heading = document.createElement('div');
  const label = document.createElement('p');
  label.className = 'kicker';
  label.textContent = kicker;
  const h3 = document.createElement('h3');
  h3.textContent = title;
  heading.append(label, h3);
  const detail = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = description;
  const a = document.createElement('a');
  a.className = 'btn';
  a.href = '../account/';
  a.textContent = action;
  detail.append(p, a);
  notice.append(heading, detail);
  return notice;
}

function clearWall() {
  for (const child of [...wall.children]) {
    if (!staticTiles.includes(child)) child.remove();
  }
}

function visibleBuilds() {
  if (state.week != null) {
    return state.builds.filter((b) => b.week === state.week);
  }
  // All: one tile per builder — feed is ordered by week ascending, so the
  // last entry seen per author is their most recently shared build.
  const byAuthor = new Map();
  for (const item of state.builds) byAuthor.set(item.author, item);
  return [...byAuthor.values()];
}

function renderTiles() {
  clearWall();
  const builds = visibleBuilds();

  if (!builds.length) {
    wall.appendChild(galleryNotice('Open space / ready for experiments',
      state.week == null ? 'The wall starts with one brave experiment.' : 'No shared builds for this week yet.',
      'Submit a build in your account and choose “Share my build with the class” to put it here. Writing is shared separately — both choices are yours.',
      'Share your first build'));
    return;
  }

  for (const b of builds) {
    const tile = document.createElement('div');
    tile.className = 'tile';

    const h3 = document.createElement('h3');
    h3.textContent = b.author;
    tile.appendChild(h3);

    const week = document.createElement('p');
    week.className = 'tile-week';
    week.textContent = `Week ${b.week}`;
    tile.appendChild(week);

    if (b.share_writing && b.body) {
      const p = document.createElement('p');
      p.textContent = excerpt(b.body);
      tile.appendChild(p);
    }

    const a = document.createElement('a');
    a.href = b.link_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = shortLink(b.link_url);
    tile.appendChild(a);

    wall.appendChild(tile);
  }

  wall.appendChild(claimTile(
    builds.length ? 'This one could be yours — share your build' : 'Be the first — share your build'
  ));
}

function claimTile(label) {
  const tile = document.createElement('div');
  tile.className = 'tile unclaimed';
  const a = document.createElement('a');
  a.href = '../account/';
  a.textContent = label;
  tile.appendChild(a);
  return tile;
}

function excerpt(text) {
  const t = text.trim();
  return t.length > 100 ? t.slice(0, 100).trim() + '…' : t;
}

function shortLink(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

loadWall();
