// Learn, Vibe, Build — one student, for the instructor.
//
// Session-gated like /instructor/: GET /instructor/student?id= returns 401 (no
// session), 403 (not the instructor) or 404 (no such student). The payload is
// never cached (no-store) and holds only this student's work and AI read.

import { API_BASE } from '../../account/config.js';
import { whenLabel } from '../../assets/weeks.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const STATUS = {
  on_time: { mark: '✓', label: 'on time' },
  late: { mark: 'L', label: 'late' },
  missing: { mark: '✗', label: 'missing' },
  not_due: { mark: '○', label: 'not due yet' },
};

async function boot() {
  const id = new URLSearchParams(location.search).get('id') || '';
  let res;
  try {
    res = await fetch(`${API_BASE}/instructor/student?id=${encodeURIComponent(id)}`, { credentials: 'include' });
  } catch {
    hide($('loading')); show($('signedout'));
    return;
  }
  hide($('loading'));
  if (res.status === 401) { show($('signedout')); return; }
  if (res.status === 403) { show($('denied')); return; }
  if (!res.ok) { show($('notfound')); return; }
  render(await res.json());
  show($('main'));
}

boot();

function render(d) {
  const s = d.student;
  document.title = `${s.name} — Instructor — Learn, Vibe, Build`;
  $('s-name').textContent = s.name;

  const meta = $('s-meta');
  const bits = [d.pod ? `${d.pod.name} (${d.pod.set_name})` : 'no current pod',
    d.last_submission_at ? `last submitted ${whenLabel(d.last_submission_at)}` : 'nothing submitted yet',
    s.signed_in ? 'has signed in' : 'never signed in'];
  bits.forEach((b, i) => {
    if (i) meta.appendChild(el('span', 'sep', '·'));
    meta.appendChild(document.createTextNode(b));
  });

  const strip = $('s-strip');
  const counts = {};
  for (const w of d.strip) {
    const st = STATUS[w.status];
    counts[w.status] = (counts[w.status] || 0) + 1;
    const cell = el('a', `wg ${w.status}`, st.mark);
    cell.href = `#week-${w.week}`;
    cell.title = `Week ${w.week} — ${w.title}: ${st.label}`;
    cell.setAttribute('aria-label', cell.title);
    const n = el('span', 'wn', String(w.week));
    cell.prepend(n);
    strip.appendChild(cell);
  }
  $('s-strip-key').textContent = ['on_time', 'late', 'missing', 'not_due']
    .filter((k) => counts[k]).map((k) => `${counts[k]} ${STATUS[k].label}`).join(' · ');

  $('s-journey').href = `../../account/journey/?as=${encodeURIComponent(s.id)}`;

  renderRead(d.read);
  renderSubmissions(d);
  renderPosts(d.posts);
}

function renderRead(read) {
  const box = $('s-read');
  if (!read) {
    box.appendChild(el('p', 'empty',
      'No read yet. worker/student_reads.py writes one on uni after their first submission (daily at 6 AM and Mondays at noon).'));
    return;
  }
  const card = el('div', 'card read student-read');
  const meta = el('div', 'meta');
  meta.appendChild(el('span', 'badge private-badge', 'private to you'));
  meta.appendChild(el('span', 'date', `updated ${whenLabel(read.generated_at)}`));
  const b = read.based_on;
  if (b) {
    const weeks = (b.weeks || []).length ? `weeks ${b.weeks.join(', ')}` : 'no submissions';
    const posts = b.posts ? ` and ${b.posts} board post${b.posts === 1 ? '' : 's'}` : '';
    meta.appendChild(el('span', 'date', `based on ${weeks}${posts}`));
  }
  card.appendChild(meta);
  card.appendChild(markdownBody(read.body));
  card.appendChild(el('p', 'hint',
    'Written by Claude from this student\'s own submissions and posts only. Check it against their work below before acting on it.'));
  box.appendChild(card);
}

function renderSubmissions(d) {
  const box = $('s-subs');
  $('s-subs-heading').textContent = `Submissions (${d.submissions.length})`;
  if (!d.submissions.length) { box.appendChild(el('p', 'empty', 'No submissions yet.')); return; }
  const title = (n) => (d.weeks.find((w) => w.week === n) || {}).title || '';
  for (const sub of d.submissions) {
    const card = el('div', 'card timeline-item');
    card.id = `week-${sub.week}`;
    const meta = el('div', 'meta');
    meta.appendChild(el('span', 'title', `Week ${sub.week} — ${title(sub.week)}`));
    if (sub.submitted_at) meta.appendChild(el('span', 'date', whenLabel(sub.submitted_at)));
    if (sub.late) meta.appendChild(el('span', 'badge late', 'late'));
    card.appendChild(meta);
    if (sub.link_url) {
      const p = el('p', 'link');
      const a = el('a', null, sub.link_url);
      a.href = sub.link_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      p.appendChild(a);
      card.appendChild(p);
    }
    for (const part of splitAttachments(sub.body)) {
      if (part.attachment) {
        const det = el('details', 'attachment');
        det.appendChild(el('summary', null, `Attachment: ${part.name} (extracted text)`));
        det.appendChild(markdownBody(part.text));
        card.appendChild(det);
      } else {
        card.appendChild(markdownBody(part.text));
      }
    }
    box.appendChild(card);
  }
}

// worker/resync.py writes a Canvas submission as body, then one
// "**Uploaded: [name](url)**\n\n<extracted text>" block per attachment,
// separated by "\n\n---\n\n". Attachment blocks collapse; the rest shows.
function splitAttachments(body) {
  const out = [];
  for (const block of String(body || '').split(/\n\n---\n\n/)) {
    const m = block.match(/^\*\*Uploaded(?: build)?: \[([^\]]*)\]\([^)]*\)\*\*/);
    if (m && block.length > m[0].length + 2) out.push({ attachment: true, name: m[1], text: block });
    else if (block.trim()) out.push({ attachment: false, text: block });
  }
  return out;
}

function renderPosts(posts) {
  const box = $('s-posts');
  $('s-posts-heading').textContent = `Class board posts (${posts.length})`;
  if (!posts.length) { box.appendChild(el('p', 'empty', 'No board posts.')); return; }
  for (const p of posts) {
    const card = el('div', 'card timeline-item');
    const meta = el('div', 'meta');
    meta.appendChild(el('span', 'badge', p.kind));
    meta.appendChild(el('span', 'title', p.title));
    meta.appendChild(el('span', 'date', `${whenLabel(p.created_at)} · ${p.pod_name ? `to ${p.pod_name}` : 'to the class'}`));
    card.appendChild(meta);
    if (p.link_url) {
      const lp = el('p', 'link');
      const a = el('a', null, p.link_url);
      a.href = p.link_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      lp.appendChild(a);
      card.appendChild(lp);
    }
    if (p.body) card.appendChild(markdownBody(p.body));
    box.appendChild(card);
  }
}

// Same contract as /instructor/: marked -> DOMPurify, never raw HTML.
function markdownBody(md) {
  const div = el('div', 'body md');
  if (window.marked && window.DOMPurify) {
    const html = window.marked.parse(md || '', { async: false });
    div.innerHTML = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  } else {
    for (const para of (md || '').split(/\n\s*\n/)) {
      if (para.trim()) div.appendChild(el('p', null, para.trim()));
    }
  }
  return div;
}
