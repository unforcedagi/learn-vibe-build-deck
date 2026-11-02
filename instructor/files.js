// Learn, Vibe, Build — what a student uploaded, readable in the instructor view.
//
// One card per Canvas upload (worker/submission_files.py writes them): the
// extracted text, plus the file as it looks — page images for PDFs, Word,
// RTF and slides; the image; the video; the HTML page itself. The Canvas
// download link stays as a small secondary "Original on Canvas" link.
//
// Renderings come from GET /instructor/file/<id>/<part>, instructor session
// only. An uploaded HTML page runs only inside a sandboxed iframe without
// allow-same-origin (an opaque origin: no cookies, no access to this page),
// with network requests and form posts blocked as well.

import { API_BASE } from '../account/config.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const KIND_LABEL = {
  pdf: 'PDF', office: 'Document', html: 'HTML page', image: 'Image', video: 'Video',
  text: 'Text file', archive: 'Zip', other: 'File',
};
const LONG_TEXT = 1200; // characters before the text box clamps with "Show all"

export const fileUrl = (f, part) => `${API_BASE}/instructor/file/${encodeURIComponent(f.id)}/${part}`;

export function hasContent(f) {
  return !!(f.text_chars || (f.text && f.text.trim()) || f.pages || f.rendition);
}

function sizeLabel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// The file cards for one submission. `markdownBody` renders HTML-page text
// (html2text writes markdown) through the caller's marked + DOMPurify path.
export function renderFiles(files, { markdownBody }) {
  const box = el('div', 'sub-files');
  for (const f of files) box.appendChild(fileCard(f, markdownBody));
  return box;
}

function fileCard(f, markdownBody) {
  const card = el('section', `sub-file kind-${f.kind}`);
  card.dataset.fileId = f.id;
  const head = el('div', 'sub-file-head');
  const label = [KIND_LABEL[f.kind] || 'File'];
  if (f.pages) label.push(`${f.pages} page${f.pages === 1 ? '' : 's'}`);
  head.appendChild(el('span', 'badge', label.join(' · ')));
  head.appendChild(el('strong', 'sub-file-name', f.name));
  const size = sizeLabel(f.size);
  if (size) head.appendChild(el('span', 'sub-file-size', size));
  if (f.canvas_url) {
    const a = el('a', 'sub-file-orig', 'Original on Canvas');
    a.href = f.canvas_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    head.appendChild(a);
  }
  card.appendChild(head);

  const views = [];
  const text = (f.text || '').trim();
  if (text) views.push({ key: 'text', label: 'Text', render: () => textView(f, text, markdownBody) });
  if (f.pages) views.push({ key: 'pages', label: `Pages (${f.pages})`, render: () => pagesView(f) });
  if (f.rendition === 'html') views.push({ key: 'page', label: 'The page', render: () => htmlView(f) });
  if (f.rendition === 'image') views.push({ key: 'image', label: 'Image', render: () => imageView(f) });
  if (f.rendition === 'video') views.push({ key: 'video', label: 'Video', render: () => videoView(f) });

  if (!views.length) {
    card.classList.add('link-only');
    const why = f.status && f.status !== 'ok' ? f.status : 'nothing to show for this file';
    card.appendChild(el('p', 'empty', `No preview (${why}). Open the original on Canvas.`));
    return card;
  }

  // Text first when there is real writing; otherwise lead with how it looks.
  const visual = views.find((v) => v.key !== 'text');
  const first = text.length >= 200 || !visual ? views[0] : visual;
  const panel = el('div', 'sub-file-panel');
  const rendered = new Map();
  const tabs = el('div', 'sub-file-tabs');
  tabs.setAttribute('role', 'tablist');
  const select = (v) => {
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.key === v.key));
    if (!rendered.has(v.key)) rendered.set(v.key, v.render());
    panel.replaceChildren(rendered.get(v.key));
  };
  for (const v of views) {
    const b = el('button', 'sub-file-tab', v.label);
    b.type = 'button';
    b.dataset.key = v.key;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => select(v));
    tabs.appendChild(b);
  }
  if (views.length > 1) card.appendChild(tabs);
  card.appendChild(panel);
  select(first);
  return card;
}

function textView(f, text, markdownBody) {
  const wrap = el('div', 'sub-file-textwrap');
  const body = f.kind === 'html' ? markdownBody(text) : el('div', 'sub-file-text', text);
  body.classList.add('sub-file-body');
  wrap.appendChild(body);
  if (text.length > LONG_TEXT) {
    wrap.classList.add('clamped');
    const more = el('button', 'btn ghost sub-file-more', 'Show all');
    more.type = 'button';
    more.addEventListener('click', () => {
      const open = wrap.classList.toggle('clamped');
      more.textContent = open ? 'Show all' : 'Show less';
    });
    wrap.appendChild(more);
  }
  return wrap;
}

function pagesView(f) {
  const box = el('div', 'sub-file-pages');
  for (let i = 1; i <= f.pages; i++) {
    const fig = el('figure', 'sub-file-page');
    const img = el('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = `Page ${i} of ${f.name}`;
    img.src = fileUrl(f, `p${i}`); // same site: the session cookie goes along
    fig.appendChild(img);
    fig.appendChild(el('figcaption', null, `Page ${i} of ${f.pages}`));
    box.appendChild(fig);
  }
  return box;
}

function imageView(f) {
  const img = el('img', 'sub-file-image');
  img.alt = f.name;
  img.src = fileUrl(f, 'rendition');
  return img;
}

function videoView(f) {
  const v = el('video', 'sub-file-video');
  v.controls = true;
  v.preload = 'metadata';
  v.src = fileUrl(f, 'rendition');
  return v;
}

// Student HTML: fetched as text, shown in a sandboxed iframe. No
// allow-same-origin, so its scripts run in an opaque origin with no cookies
// and no reach into this page; no allow-forms/popups/top-navigation; and a
// CSP placed ahead of the student's markup blocks fetch/XHR, form posts and
// nested frames.
const SANDBOX_CSP = "connect-src 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'";

export function sandboxedHtml(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`;
  const doctype = /^﻿?\s*<!doctype[^>]*>/i.exec(html);
  // After a doctype (or the page drops to quirks mode), else first: either
  // way the policy is in force before any of the student's markup.
  return doctype ? doctype[0] + meta + html.slice(doctype[0].length) : meta + html;
}

function htmlView(f) {
  const box = el('div', 'sub-file-html');
  const note = el('p', 'hint',
    `Runs the uploaded page in a locked-down frame (its scripts can't reach this site or the network)${f.size ? ` · ${sizeLabel(f.size)}` : ''}.`);
  const load = el('button', 'btn', 'Show the page');
  load.type = 'button';
  load.addEventListener('click', async () => {
    load.disabled = true;
    load.textContent = 'Loading…';
    try {
      const res = await fetch(fileUrl(f, 'rendition'), { credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      const frame = el('iframe', 'sub-file-frame');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.title = f.name;
      frame.srcdoc = sandboxedHtml(await res.text());
      box.replaceChildren(frame);
    } catch {
      load.disabled = false;
      load.textContent = 'Could not load. Try again';
    }
  });
  box.appendChild(load);
  box.appendChild(note);
  return box;
}

// worker/resync.py writes a Canvas submission body as: the student's text,
// then one "**Uploaded: [name](url)**\n\n<extracted text>" block per file
// ("\n\n---\n\n" between files), then "**Comment on Canvas:**\n\n...". When
// the files have their own cards, the instructor sees the writing and the
// comment from the body and the files from the cards, not twice.
const UPLOAD_HEAD = /(^|\n\n)\*\*Uploaded(?: build)?: \[[^\]]*\]\([^)]*\)\*\*/;
const COMMENT_HEAD = '\n\n**Comment on Canvas:**\n\n';

export function bodyWithoutUploads(body) {
  const s = String(body || '');
  const m = UPLOAD_HEAD.exec(s);
  if (!m) return s;
  const writing = s.slice(0, m.index).replace(/\n*-{3,}\s*$/, '').trim();
  const c = s.lastIndexOf(COMMENT_HEAD);
  const comment = c > m.index ? s.slice(c).trim() : '';
  return [writing, comment].filter(Boolean).join('\n\n');
}

// Is this link just the Canvas download of one of the files?
export function isCanvasFileLink(url, files) {
  if (!url || !files || !files.length) return false;
  if (files.some((f) => f.canvas_url === url)) return true;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('instructure.com') || /(^|\.)canvas\./.test(u.hostname)
      ? u.pathname.includes('/files/') : false;
  } catch {
    return false;
  }
}
