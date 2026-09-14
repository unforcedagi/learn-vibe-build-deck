// The Studio — live wall.
//
// Sourced from the same feed the account page reads: submissions where a
// student checked "share my build with the class" (share_build=1). Signed
// in only — that checkbox's copy promises the class, not the public
// internet, so the wall honors the same audience as /feed rather than
// broadening it. Aaron's founding tile above stays static; it's content he
// put on a public page himself, not something a student's checkbox implied.
//
// The week filter is client-side over the one /feed payload. "All" shows one
// tile per builder (their most recent shared build); a specific week shows
// that week's builds, so the wall can be replayed week by week.

import { API_BASE } from '../account/config.js';
import { renderWeekFilter } from '../assets/weeks.js';

const wall = document.getElementById('wall');
const hint = document.getElementById('wall-hint');
const filterBox = document.getElementById('wall-filter');

// Everything already in the wall when the page loaded (Aaron's founding tile)
// stays put; only tiles this script added get cleared on a re-render.
const staticTiles = wall ? [...wall.children] : [];

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
  wall.appendChild(claimTile('Sign in to see who’s building'));
  hint.remove();
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
