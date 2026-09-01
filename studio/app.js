// The Studio — live wall.
//
// Sourced from the same feed the account page reads: submissions where a
// student checked "share my build with the class" (share_build=1). Signed
// in only — that checkbox's copy promises the class, not the public
// internet, so the wall honors the same audience as /feed rather than
// broadening it. Aaron's founding tile above stays static; it's content he
// put on a public page himself, not something a student's checkbox implied.

import { API_BASE } from '../account/config.js';

const wall = document.getElementById('wall');
const hint = document.getElementById('wall-hint');

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

  const { feed } = await res.json();
  const builds = (feed || []).filter((item) => item.share_build && item.link_url);

  // One tile per builder — feed is ordered by week ascending, so the last
  // entry seen per author is their most recently shared build.
  const byAuthor = new Map();
  for (const item of builds) byAuthor.set(item.author, item);

  renderTiles([...byAuthor.values()]);
  hint.remove();
}

function renderSignedOut() {
  wall.appendChild(claimTile('Sign in to see who’s building'));
  hint.remove();
}

function renderTiles(builds) {
  for (const b of builds) {
    const tile = document.createElement('div');
    tile.className = 'tile';

    const h3 = document.createElement('h3');
    h3.textContent = b.author;
    tile.appendChild(h3);

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
