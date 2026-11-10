import { handleMcp } from './mcp.js';
import { WEEKS, DEMO_DAYS } from './weeks.generated.js';
import {
  DEMO_SLOTS, DEMO_MINUTES, DEMO_TITLE_MAX, DEMO_NAME_MAX, slotTime, dayLabel, denverToday, runningOrderText,
} from './demos.js';
import { buildPrompt } from './fpprompt.js';
// Learn, Vibe, Build — accounts API (Cloudflare Worker + D1).
//
// Auth model: passwordless magic links. We store only sha256 hashes of both
// magic-link tokens and session tokens. Sessions live in an HttpOnly cookie
// scoped to .learnvibe.build so the static site at cu.learnvibe.build can
// make credentialed same-site fetches to api.learnvibe.build.

const COOKIE_NAME = 'lvb_session';
const MAGIC_TTL_MS = 15 * 60 * 1000;         // 15 minutes
const HANDED_TTL_MS = 30 * 60 * 1000;        // instructor-made link: 30 minutes
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const RATE_LIMIT_MAX = 3;                     // per email per 15 minutes

// ---------------------------------------------------------------------------
// Weeks — the course calendar, generated from schedule/semester.json.
//
// Every client (instructor view, account page, studio wall) reads its week
// numbers, titles, due dates and Canvas links from WEEKS. To add or change a
// week, edit schedule/semester.json and run `python3 tools/build_schedule.py`.
// `due_at` is the real deadline in UTC: 05:59Z is 11:59 PM MDT the evening
// before, 06:59Z is 11:59 PM MST.
// ---------------------------------------------------------------------------

// The week currently accepting new site-native submissions (build link +
// writing, both share flags). The open week is derived from the calendar: the first week whose due date
// hasn't passed yet (so it never gets stuck again). Students may submit or
// update ANY week up to and including the open one; late work is accepted,
// same as Canvas.
function openWeek(now = Date.now()) {
  const next = WEEKS.find((w) => Date.parse(w.due_at) > now);
  return next ? next.week : WEEKS[WEEKS.length - 1].week;
}


// Legacy alias, kept so a cached client still reading `current_week` keeps
// working. It derives from openWeek() now instead of drifting on its own.
// (The old DEMO_WEEK lived in instructor/app.js and is gone — the instructor
// view's week tabs decide which week is on screen.)


// ---------------------------------------------------------------------------
// Weekly readings — a running list for the term. Served only to signed-in
// students via /me. Gift links for paywalled readings are NOT in this file (the
// repo is public): they live in the READING_LINKS Worker secret, a JSON object
// keyed by week, e.g. {"6": "<gift link>"}. Set it with
//   npx wrangler secret put READING_LINKS
// The public /readings/ page shows title, author and the paywalled URL only.
// ---------------------------------------------------------------------------

const READINGS = [
  {
    week: 6,
    title: 'How to Get Better at AI by Asking AI',
    author: 'Arielle Shipper',
    source: 'Every',
    date: '2026-10-02',
    public_url: 'https://every.to/p/codex-graded-my-ai-habits-then-it-became-my-coach',
    why: 'Use your own AI as a coach: ask it to place you on the eight levels of AI adoption, replay a finished project one level up, then have it teach you the next step.',
  },
];

function readingsFor(env) {
  let links = {};
  try { links = JSON.parse(env.READING_LINKS || '{}'); } catch { links = {}; }
  return READINGS.map((r) => ({ ...r, url: links[String(r.week)] || r.public_url }));
}

const MIN_WRITING_CHARS = 120; // roughly a short paragraph

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const nowISO = () => new Date().toISOString();
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();
const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.SITE_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function json(env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
      ...extra,
    },
  });
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function sessionCookie(value, maxAgeSeconds) {
  return (
    `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; ` +
    `Domain=.learnvibe.build; Path=/; Max-Age=${maxAgeSeconds}`
  );
}

async function currentStudent(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const hash = await sha256hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id, s.canvas_id, s.name, s.email, s.is_instructor
       FROM sessions ses JOIN students s ON s.id = ses.student_id
      WHERE ses.token_hash = ? AND ses.expires_at > ?`
  ).bind(hash, nowISO()).first();
  return row || null;
}

async function sendMagicEmail(env, to, link) {
  // Cloudflare Email Service — the `from` domain (learnvibe.build) is
  // already onboarded with DKIM/SPF/DMARC for the main learnvibe.build
  // worker, so mail sent through this binding authenticates cleanly.
  // Resolves to { messageId }.
  return env.EMAIL.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Your Learn Vibe Build sign-in link',
    text:
      `Here is your sign-in link for the Learn, Vibe, Build class site:\n\n` +
      `${link}\n\n` +
      `It expires in 15 minutes. This link only works for the email on ` +
      `your Canvas account.\n\n` +
      `If you didn't request this, you can ignore it.`,
    html:
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b1b1b;max-width:32em">` +
      `<p>Here is your sign-in for the Learn, Vibe, Build class site:</p>` +
      `<p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#1b4fd8;color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px">Sign in</a></p>` +
      `<p style="color:#555">It expires in 15 minutes and only works for the email on your Canvas account. ` +
      `If the button doesn't work, open this link: <a href="${link}">${link}</a></p>` +
      `<p style="color:#888">If you didn't request this, you can ignore it.</p>` +
      `</div>`,
  });
}

// A send failure as a short, non-secret reason: the error code plus its
// message with any URL (the link), token-like hex or address cut out.
function scrub(s) {
  return String(s || '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{32,}/gi, '<hex>')
    .replace(/[^\s<>@]+@[^\s<>@]+/g, '<address>');
}
function sendFailure(err) {
  const code = scrub(err?.code || err?.name || 'Error').slice(0, 40);
  const msg = scrub(err?.message).slice(0, 160);
  return msg ? `${code}: ${msg}` : code;
}

// A one-time sign-in token for a student's canonical email. Only its hash is
// stored; returns the token and the link that carries it.
async function mintMagicToken(env, email, ttlMs, sentTo, status = null) {
  const token = randomToken();
  const hash = await sha256hex(token);
  const createdAt = nowISO();
  const expiresAt = isoIn(ttlMs);
  await env.DB.prepare(
    `INSERT INTO magic_tokens (token_hash, email, created_at, expires_at, sent_to, send_status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(hash, email, createdAt, expiresAt, sentTo, status).run();
  return { hash, createdAt, expiresAt, link: `${env.API_ORIGIN}/auth/callback?token=${token}` };
}

// Record what happened to a link on its row, for the instructor's student
// page. Best effort: a failed write here must never break signing in.
async function recordSend(env, hash, status, messageId = null) {
  try {
    await env.DB.prepare(
      'UPDATE magic_tokens SET send_status = ?, send_message_id = ? WHERE token_hash = ?'
    ).bind(status, messageId, hash).run();
  } catch (err) {
    console.error('magic send status not recorded:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleAuthRequest(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(env, { error: 'bad_request' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return json(env, { error: 'bad_request' }, 400);

  // Either the Canvas-reported email or an alternate sign-in address (e.g.
  // an identikey@colorado.edu) works — see students.login_alias.
  const student = await env.DB.prepare(
    'SELECT id, email FROM students WHERE email = ? OR login_alias = ?'
  ).bind(email, email).first();
  if (!student) return json(env, { error: 'not_on_roster' }, 404);

  // Rate limit, keyed on the canonical email so both addresses share one
  // bucket: max 3 emailed links per student per 15 minutes. Links the
  // instructor made in person don't count.
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM magic_tokens
      WHERE email = ? AND created_at > ? AND (sent_to IS NULL OR sent_to != 'in_person')`
  ).bind(student.email, isoAgo(MAGIC_TTL_MS)).first();
  if ((recent?.n ?? 0) >= RATE_LIMIT_MAX) {
    return json(env, { error: 'rate_limited' }, 429);
  }

  const sentTo = email === student.email.toLowerCase() ? 'email' : 'alias';
  const { hash, link } = await mintMagicToken(env, student.email, MAGIC_TTL_MS, sentTo);

  // One log line per attempt: student id, which address, the recipient's
  // domain, and Cloudflare's message id or error. Never the address, link or token.
  const logged = { event: 'magic_email', student_id: student.id, sent_to: sentTo, to_domain: email.split('@').pop() };
  try {
    const result = await sendMagicEmail(env, email, link); // deliver to whatever address they typed
    const messageId = result?.messageId ? String(result.messageId).slice(0, 200) : null;
    console.log(JSON.stringify({ ...logged, ok: true, message_id: messageId }));
    await recordSend(env, hash, 'sent', messageId);
  } catch (err) {
    const reason = sendFailure(err);
    console.error(JSON.stringify({ ...logged, ok: false, error: reason }));
    await recordSend(env, hash, `failed: ${reason}`);
    return json(env, { error: 'email_failed' }, 502);
  }
  return json(env, { ok: true });
}

// Magic-link callback, two steps. GET only checks the token and shows a
// page with a single "Sign in" button; POST consumes the token and starts
// the session. Why: CU mail is Microsoft 365, and Defender Safe Links (and
// chat link previews) fetch URLs before the human clicks. A single-use
// token consumed on GET can be burned by the scanner; a button can't be
// pressed by one.
async function loadMagicToken(env, token) {
  if (!token) return null;
  const hash = await sha256hex(token);
  const row = await env.DB.prepare(
    'SELECT token_hash, email, created_at, expires_at, used_at FROM magic_tokens WHERE token_hash = ?'
  ).bind(hash).first();
  if (!row || row.used_at || row.expires_at <= nowISO()) return null;
  return { hash, row };
}

function callbackFail(env) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${env.SITE_ORIGIN}/account/#error=expired` },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function handleAuthCallbackPage(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const found = await loadMagicToken(env, token);
  if (!found) return callbackFail(env);
  const minutes = Math.round((Date.parse(found.row.expires_at) - Date.parse(found.row.created_at)) / 60000) || 15;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in — Learn, Vibe, Build</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #faf8f4; color: #1b1b1b; }
  main { max-width: 28rem; margin: 18vh auto 0; padding: 0 1.25rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
  p { color: #555; line-height: 1.5; margin: 0 0 1.5rem; }
  button { font: inherit; font-size: 1.05rem; font-weight: 600; padding: .8rem 1.8rem; border: 0; border-radius: .6rem; background: #1b4fd8; color: #fff; cursor: pointer; }
  button:hover { background: #163fae; }
  small { display: block; margin-top: 1.5rem; color: #888; }
</style>
</head>
<body>
<main>
  <h1>Sign in to Learn, Vibe, Build</h1>
  <p>One click and you're in. This works once and expires ${minutes} minutes after it was made.</p>
  <form method="post" action="/auth/callback">
    <input type="hidden" name="token" value="${escapeHtml(token)}">
    <button type="submit">Sign in</button>
  </form>
  <small>Signing in as the email on your Canvas account.</small>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

async function handleAuthCallbackConsume(request, env) {
  let token = '';
  try {
    const form = await request.formData();
    token = String(form.get('token') || '');
  } catch (_) {
    return callbackFail(env);
  }
  const found = await loadMagicToken(env, token);
  if (!found) return callbackFail(env);
  const { hash, row } = found;

  const student = await env.DB.prepare(
    'SELECT id FROM students WHERE email = ?'
  ).bind(row.email).first();
  if (!student) return callbackFail(env);

  // Single use: mark consumed atomically-enough (guard on used_at IS NULL).
  const marked = await env.DB.prepare(
    'UPDATE magic_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL'
  ).bind(nowISO(), hash).run();
  if (!marked.meta || marked.meta.changes !== 1) return callbackFail(env);

  const session = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, student_id, expires_at) VALUES (?, ?, ?)'
  ).bind(await sha256hex(session), student.id, isoIn(SESSION_TTL_MS)).run();

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.SITE_ORIGIN}/account/`,
      'Set-Cookie': sessionCookie(session, SESSION_TTL_MS / 1000),
    },
  });
}

// Full roster with per-student submissions — the instructor's view of the
// class. Used by both /me (legacy dashboard) and /instructor/data.
async function instructorRoster(env) {
  // signed_in: has ever completed a sign-in. Session rows count, but so do
  // consumed magic tokens (logout deletes the session row; the used token
  // is the durable evidence).
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name, s.email, s.canvas_id,
            (EXISTS (SELECT 1 FROM sessions ses WHERE ses.student_id = s.id)
             OR EXISTS (SELECT 1 FROM magic_tokens mt
                         WHERE mt.email = s.email AND mt.used_at IS NOT NULL)
            ) AS signed_in,
            sub.id AS sub_id, sub.week, sub.body, sub.submitted_at,
            sub.link_url, sub.share_build, sub.share_writing
       FROM students s
       LEFT JOIN submissions sub ON sub.student_id = s.id
      WHERE s.is_instructor = 0
      ORDER BY s.name, sub.week`
  ).all();
  const [files, gifts] = await Promise.all([filesByStudentWeek(env, null, false), giftIds(env)]);
  const roster = new Map();
  for (const r of rows.results) {
    if (!roster.has(r.email)) {
      roster.set(r.email, {
        id: r.id, name: r.name, email: r.email,
        on_canvas: !!r.canvas_id,
        signed_in: !!r.signed_in,
        gift: gifts.has(r.id) ? { url: `/gift/${r.id}` } : null,
        submissions: [],
      });
    }
    if (r.sub_id != null) {
      roster.get(r.email).submissions.push({
        id: r.sub_id, week: r.week, body: r.body,
        submitted_at: r.submitted_at, link_url: r.link_url,
        share_build: !!r.share_build, share_writing: !!r.share_writing,
        files: files.get(`${r.id}:${r.week}`) || [],
      });
    }
  }
  return [...roster.values()];
}

// ---------------------------------------------------------------------------
// Uploaded files, readable (submission_files, 0009). Written on uni by
// worker/resync.py --files: extracted text in D1, page images and the file
// itself in the private R2 bucket (FILES) under files/<canvas_file_id>/.
// Instructor only. The student-facing endpoints never read this table.
// ---------------------------------------------------------------------------

const FILE_COLS = `id, student_id, week, position, name, kind, content_type, size, pages,
  rendition, rendition_type, canvas_url, status, LENGTH(text) AS text_chars`;

function fileRow(r) {
  const out = {
    id: r.id, week: r.week, name: r.name, kind: r.kind, content_type: r.content_type,
    size: r.size, pages: r.pages, rendition: r.rendition, rendition_type: r.rendition_type,
    canvas_url: r.canvas_url, status: r.status, text_chars: r.text_chars || 0,
  };
  if (r.text !== undefined) out.text = r.text || '';
  return out;
}

// Map "<student_id>:<week>" -> files in upload order. All students, one
// student, or one student's week.
async function filesByStudentWeek(env, studentId, withText, week = null) {
  const cols = withText ? `${FILE_COLS}, text` : FILE_COLS;
  const q = studentId == null
    ? env.DB.prepare(`SELECT ${cols} FROM submission_files ORDER BY student_id, week, position`)
    : week == null
      ? env.DB.prepare(`SELECT ${cols} FROM submission_files WHERE student_id = ? ORDER BY week, position`).bind(studentId)
      : env.DB.prepare(`SELECT ${cols} FROM submission_files WHERE student_id = ? AND week = ? ORDER BY position`).bind(studentId, week);
  const out = new Map();
  for (const r of (await q.all()).results) {
    const k = `${r.student_id}:${r.week}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(fileRow(r));
  }
  return out;
}

// One student's files for one week, with their text (the roster's detail row).
async function handleInstructorFiles(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!me.is_instructor) return json(env, { error: 'forbidden' }, 403);
  const noStore = { 'Cache-Control': 'no-store' };
  const q = new URL(request.url).searchParams;
  const student = q.get('student') || '';
  const week = q.get('week') || '';
  if (!/^\d+$/.test(student) || !/^\d+$/.test(week)) return json(env, { error: 'bad_request' }, 400, noStore);
  const files = await filesByStudentWeek(env, Number(student), true, Number(week));
  return json(env, { files: files.get(`${student}:${week}`) || [] }, 200, noStore);
}

// The renderings themselves: GET /instructor/file/<id>/p<N> (a page image) or
// /instructor/file/<id>/rendition (the HTML page, image or video as uploaded).
// Student HTML is sent as text/plain and every response carries a sandbox CSP,
// so opening one of these URLs directly never runs a student's script in the
// api origin; the instructor page shows HTML only in a sandboxed iframe.
const RENDITION_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/quicktime', 'video/webm']);

async function handleInstructorFile(request, env, id, part) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!me.is_instructor) return json(env, { error: 'forbidden' }, 403);
  const f = await env.DB.prepare(
    'SELECT canvas_file_id, pages, rendition, rendition_type FROM submission_files WHERE id = ?'
  ).bind(id).first();
  if (!f) return json(env, { error: 'not_found' }, 404);
  let key;
  let type;
  const page = part.match(/^p(\d+)$/);
  if (page && Number(page[1]) >= 1 && Number(page[1]) <= f.pages) {
    key = `files/${f.canvas_file_id}/p${Number(page[1])}.jpg`;
    type = 'image/jpeg';
  } else if (part === 'rendition' && f.rendition) {
    key = `files/${f.canvas_file_id}/rendition`;
    type = f.rendition === 'html' ? 'text/plain; charset=utf-8'
      : RENDITION_TYPES.has(f.rendition_type) ? f.rendition_type : 'application/octet-stream';
  } else {
    return json(env, { error: 'not_found' }, 404);
  }
  if (!env.FILES) return json(env, { error: 'not_configured' }, 503);
  return r2Response(request, env.FILES, key, {
    ...corsHeaders(env),
    'Content-Type': type,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
}

// Instructor "view as student": read-only. `?as=<student_id>` is honored
// only for an instructor session; anyone else passing it gets 403 (never
// their own data silently). No session is minted for the student, and the
// router refuses every write that carries `as` (see the fetch handler).
async function viewAsTarget(request, env, me) {
  const asParam = new URL(request.url).searchParams.get('as');
  if (asParam == null) return { target: null };
  if (!me.is_instructor) return { error: json(env, { error: 'forbidden' }, 403) };
  if (!/^\d+$/.test(asParam)) return { error: json(env, { error: 'bad_request' }, 400) };
  const target = await env.DB.prepare(
    'SELECT id, canvas_id, name, email, is_instructor FROM students WHERE id = ? AND is_instructor = 0'
  ).bind(asParam).first();
  if (!target) return { error: json(env, { error: 'not_found' }, 404) };
  return { target };
}

async function handleInstructorStudents(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!me.is_instructor) return json(env, { error: 'forbidden' }, 403);
  const rows = await env.DB.prepare(
    'SELECT id, name FROM students WHERE is_instructor = 0 ORDER BY name'
  ).all();
  return json(env, { students: rows.results });
}

// One student, for the instructor: header facts, a week strip, every
// submission and board post, and their AI read (student_reads, written on uni
// by worker/student_reads.py). Instructor session only; never cached.
async function handleInstructorStudent(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!me.is_instructor) return json(env, { error: 'forbidden' }, 403);
  const noStore = { 'Cache-Control': 'no-store' };
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^\d+$/.test(id)) return json(env, { error: 'bad_request' }, 400, noStore);
  const s = await env.DB.prepare(
    `SELECT id, name, email, canvas_id,
            (EXISTS (SELECT 1 FROM sessions ses WHERE ses.student_id = students.id)
             OR EXISTS (SELECT 1 FROM magic_tokens mt
                         WHERE mt.email = students.email AND mt.used_at IS NOT NULL)) AS signed_in
       FROM students WHERE id = ? AND is_instructor = 0`
  ).bind(id).first();
  if (!s) return json(env, { error: 'not_found' }, 404, noStore);

  const [subs, posts, pods, read, attempts] = await Promise.all([
    env.DB.prepare(
      'SELECT week, body, submitted_at, link_url FROM submissions WHERE student_id = ? ORDER BY week'
    ).bind(s.id).all(),
    env.DB.prepare(
      `SELECT p.id, p.kind, p.title, p.body, p.link_url, p.created_at, pd.name AS pod_name
         FROM board_posts p LEFT JOIN pods pd ON pd.id = p.pod_id
        WHERE p.student_id = ? ORDER BY p.created_at`
    ).bind(s.id).all(),
    env.DB.prepare(
      `SELECT p.name, ps.name AS set_name, ps.starts_on, ps.ends_on
         FROM pod_members m JOIN pods p ON p.id = m.pod_id JOIN pod_sets ps ON ps.id = p.pod_set_id
        WHERE m.student_id = ? ORDER BY ps.starts_on DESC, p.id`
    ).bind(s.id).all(),
    env.DB.prepare(
      'SELECT body, based_on, model, generated_at FROM student_reads WHERE student_id = ?'
    ).bind(s.id).first(),
    // Recent sign-in links, newest first, so a stuck student is obvious.
    env.DB.prepare(
      `SELECT created_at, expires_at, used_at, sent_to, send_status, send_message_id
         FROM magic_tokens WHERE email = ? ORDER BY created_at DESC, rowid DESC LIMIT 10`
    ).bind(s.email).all(),
  ]);

  const due = new Map(WEEKS.map((w) => [w.week, w.due_at]));
  const isLate = (week, at) => !!(at && due.get(week) && Date.parse(at) > Date.parse(due.get(week)));
  const files = await filesByStudentWeek(env, s.id, true);
  const submissions = subs.results.map((r) => ({
    ...r, late: isLate(r.week, r.submitted_at), files: files.get(`${s.id}:${r.week}`) || [],
  }));
  const byWeek = new Map(submissions.map((r) => [r.week, r]));
  const now = Date.now();
  const open = openWeek(now);
  const strip = WEEKS.filter((w) => w.week <= open).map((w) => {
    const sub = byWeek.get(w.week);
    const dueAt = Date.parse(w.due_at);
    const status = sub ? (sub.late ? 'late' : 'on_time')
      : (!(dueAt <= now) ? 'not_due' : 'missing'); // no due date reads as not due
    return { week: w.week, title: w.title, status };
  });
  const today = todayISO();
  const current = pods.results.find((p) => p.starts_on <= today && (!p.ends_on || p.ends_on >= today));
  let basedOn = null;
  try { basedOn = read?.based_on ? JSON.parse(read.based_on) : null; } catch { basedOn = null; }

  return json(env, {
    student: { id: s.id, name: s.name, email: s.email, on_canvas: !!s.canvas_id, signed_in: !!s.signed_in },
    pod: current ? { name: current.name, set_name: current.set_name } : null,
    weeks: WEEKS,
    strip,
    last_submission_at: submissions.reduce((m, r) => (r.submitted_at && r.submitted_at > m ? r.submitted_at : m), '') || null,
    submissions,
    posts: posts.results,
    read: read ? { body: read.body, model: read.model, generated_at: read.generated_at, based_on: basedOn } : null,
    gift: await giftFor(env, s.id),
    signin_attempts: attempts.results,
  }, 200, noStore);
}

// A sign-in link the instructor hands a student in person (for when the
// emailed one never arrives): same magic_tokens row and hashing as the email
// flow, 30 minutes, works once. Instructor session only; the link is shown
// once and never stored or logged.
async function handleInstructorSigninLink(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!me.is_instructor) return json(env, { error: 'forbidden' }, 403);
  const noStore = { 'Cache-Control': 'no-store' };
  // JSON only: a cross-site form can't send it without a CORS preflight.
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) {
    return json(env, { error: 'unsupported_media_type' }, 415, noStore);
  }
  const body = await readJson(request);
  const id = String(body?.student_id ?? '');
  if (!/^\d+$/.test(id)) return json(env, { error: 'bad_request' }, 400, noStore);
  const s = await env.DB.prepare(
    'SELECT id, email FROM students WHERE id = ? AND is_instructor = 0'
  ).bind(id).first();
  if (!s) return json(env, { error: 'not_found' }, 404, noStore);

  // One live in-person link per student: a new one ends any earlier unused one
  // (say it was shown to the wrong person).
  await env.DB.prepare(
    `UPDATE magic_tokens SET expires_at = ?
      WHERE email = ? AND sent_to = 'in_person' AND used_at IS NULL AND expires_at > ?`
  ).bind(nowISO(), s.email, nowISO()).run();
  const { link, createdAt, expiresAt } = await mintMagicToken(env, s.email, HANDED_TTL_MS, 'in_person', 'shown to instructor');
  console.log(JSON.stringify({ event: 'instructor_signin_link', student_id: s.id, by: me.id }));
  return json(env, { link, created_at: createdAt, expires_at: expiresAt }, 200, noStore);
}

async function handleMe(request, env) {
  const viewer = await currentStudent(request, env);
  if (!viewer) return json(env, { error: 'unauthorized' }, 401);
  const { target, error } = await viewAsTarget(request, env, viewer);
  if (error) return error;
  const me = target || viewer;

  const subs = await env.DB.prepare(
    `SELECT id, week, body, submitted_at, link_url, share_build, share_writing
       FROM submissions WHERE student_id = ? ORDER BY week`
  ).bind(me.id).all();

  const out = {
    name: me.name,
    email: me.email,
    is_instructor: !!me.is_instructor,
    weeks: WEEKS,
    open_week: openWeek(),
    readings: readingsFor(env),
    submissions: subs.results.map((s) => ({
      ...s, share_build: !!s.share_build, share_writing: !!s.share_writing,
    })),
    gift: null,
    demo_signup: null,
  };
  [out.gift, out.demo_signup] = await Promise.all([giftFor(env, me.id), demoLink(env, me)]);

  if (target) {
    out.viewing_as = { id: target.id, first_name: (target.name || '').trim().split(/\s+/)[0] };
    out.read_only = true;
    out.viewer_is_instructor = true;
  } else if (me.is_instructor) {
    out.roster = await instructorRoster(env);
  }

  return json(env, out);
}

// The Week 9 final project prompt with this student's own semester filled in:
// their submissions and their own board posts (class and pod), nothing else.
// Same scoping as /me: the session's student, or read-only view-as for the instructor.
async function handleFinalProjectPrompt(request, env) {
  const viewer = await currentStudent(request, env);
  if (!viewer) return json(env, { error: 'unauthorized' }, 401);
  const { target, error } = await viewAsTarget(request, env, viewer);
  if (error) return error;
  const me = target || viewer;
  const [subs, posts] = await Promise.all([
    env.DB.prepare(
      'SELECT week, body, submitted_at, link_url FROM submissions WHERE student_id = ? ORDER BY week'
    ).bind(me.id).all(),
    env.DB.prepare(
      `SELECT p.kind, p.title, p.body, p.link_url, p.created_at, pd.name AS pod_name
         FROM board_posts p LEFT JOIN pods pd ON pd.id = p.pod_id
        WHERE p.student_id = ? ORDER BY p.created_at`
    ).bind(me.id).all(),
  ]);
  const out = buildPrompt({ weeks: WEEKS, submissions: subs.results, posts: posts.results });
  return json(env, out, 200, { 'Cache-Control': 'no-store' });
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function handleSubmit(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(env, { error: 'bad_request' }, 400);
  }

  const week = Number(body.week);
  const linkUrl = String(body.link_url || '').trim();
  const writing = String(body.body || '').trim();
  const shareBuild = !!body.share_build && !!linkUrl;
  const shareWriting = !!body.share_writing;

  if (!WEEKS.some((w) => w.week === week) || week > openWeek()) return json(env, { error: 'week_closed' }, 400);
  if (!(week === 6 && !linkUrl) && !isHttpUrl(linkUrl)) return json(env, { error: 'bad_link' }, 400);
  if (writing.length < MIN_WRITING_CHARS) {
    return json(env, { error: 'writing_too_short', min_chars: MIN_WRITING_CHARS }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO submissions (student_id, week, body, link_url, share_build, share_writing, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, week) DO UPDATE SET
       body = excluded.body,
       link_url = excluded.link_url,
       share_build = excluded.share_build,
       share_writing = excluded.share_writing,
       submitted_at = excluded.submitted_at`
  ).bind(me.id, week, writing, linkUrl, shareBuild ? 1 : 0, shareWriting ? 1 : 0, nowISO()).run();

  const row = await env.DB.prepare(
    `SELECT id, week, body, submitted_at, link_url, share_build, share_writing
       FROM submissions WHERE student_id = ? AND week = ?`
  ).bind(me.id, week).first();

  return json(env, {
    ok: true,
    submission: { ...row, share_build: !!row.share_build, share_writing: !!row.share_writing },
  });
}

// ---------------------------------------------------------------------------
// Instructor view + admin "reads" (weekly synthesis notes)
// ---------------------------------------------------------------------------

async function handleInstructorData(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!me.is_instructor) return json(env, { error: 'forbidden' }, 403);

  const reads = await env.DB.prepare(
    `SELECT id, week, slug, title, body, audience, updated_at
       FROM reads ORDER BY week DESC, slug`
  ).all();
  const roster = await instructorRoster(env);
  return json(env, {
    reads: reads.results,
    roster,
    stats: rosterStats(roster),
    weeks: WEEKS,
    open_week: openWeek(),
    current_week: openWeek(), // legacy field, still the open week
  });
}

// Per-week counts for the instructor's tabs. `total` and `signed_in` are
// class-wide; everything week-specific lives under by_week, keyed by week
// number as a string so it survives JSON round-tripping unambiguously.
function rosterStats(roster) {
  const by_week = {};
  for (const { week } of WEEKS) {
    const subs = roster
      .map((s) => (s.submissions || []).find((sub) => sub.week === week))
      .filter(Boolean);
    by_week[String(week)] = {
      submitted: subs.length,
      shared_build: subs.filter((sub) => sub.share_build).length,
      shared_writing: subs.filter((sub) => sub.share_writing).length,
    };
  }
  return {
    total: roster.length,
    signed_in: roster.filter((s) => s.signed_in).length,
    by_week,
    // Legacy flat field — the open week's count, as the old stats line read it.
    submitted: by_week[String(openWeek())]?.submitted ?? 0,
  };
}

// Admin auth: `Authorization: Bearer <ADMIN_KEY>`, checked against the
// ADMIN_KEY Worker secret. Compare digests, not strings, to avoid an
// early-exit timing side channel. This is the surface a future MCP wraps.
async function adminAuthorized(request, env) {
  if (!env.ADMIN_KEY) return false;
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const presented = header.slice(7).trim();
  if (!presented) return false;
  return (await sha256hex(presented)) === (await sha256hex(env.ADMIN_KEY));
}

async function handleReadsUpsert(request, env) {
  if (!(await adminAuthorized(request, env))) {
    return json(env, { error: 'unauthorized' }, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json(env, { error: 'bad_request' }, 400);
  }
  const week = Number(body.week);
  const slug = String(body.slug || '').trim();
  const title = String(body.title || '').trim();
  const text = typeof body.body === 'string' ? body.body : '';
  const audience = body.audience || 'instructor';

  if (!Number.isInteger(week) || week < 0) return json(env, { error: 'bad_week' }, 400);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return json(env, { error: 'bad_slug' }, 400);
  if (audience !== 'instructor' && audience !== 'class') {
    return json(env, { error: 'bad_audience' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO reads (week, slug, title, body, audience, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(week, slug) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       audience = excluded.audience,
       updated_at = excluded.updated_at`
  ).bind(week, slug, title, text, audience, nowISO()).run();

  const row = await env.DB.prepare(
    'SELECT id, week, slug, title, audience, updated_at FROM reads WHERE week = ? AND slug = ?'
  ).bind(week, slug).first();
  return json(env, { ok: true, read: row });
}

async function handleReadsList(request, env) {
  if (!(await adminAuthorized(request, env))) {
    return json(env, { error: 'unauthorized' }, 401);
  }
  const rows = await env.DB.prepare(
    `SELECT id, week, slug, title, audience, updated_at, length(body) AS body_bytes
       FROM reads ORDER BY week DESC, slug`
  ).all();
  return json(env, { reads: rows.results });
}

async function handleReadsDelete(request, env, week, slug) {
  if (!(await adminAuthorized(request, env))) {
    return json(env, { error: 'unauthorized' }, 401);
  }
  const res = await env.DB.prepare(
    'DELETE FROM reads WHERE week = ? AND slug = ?'
  ).bind(Number(week), slug).run();
  if (!res.meta || res.meta.changes !== 1) {
    return json(env, { error: 'not_found' }, 404);
  }
  return json(env, { ok: true });
}

async function handleFeed(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT sub.id, sub.week, sub.body, sub.submitted_at, sub.link_url,
            sub.share_build, sub.share_writing, s.name AS author
       FROM submissions sub JOIN students s ON s.id = sub.student_id
      WHERE sub.share_build = 1 OR sub.share_writing = 1
      ORDER BY sub.week, s.name`
  ).all();
  // A row is in the feed if EITHER flag is set, so the body must be withheld
  // unless the writing flag specifically is set — otherwise "share my build"
  // would also publish writing the student kept private.
  const feed = rows.results.map((r) => ({
    ...r,
    body: r.share_writing ? r.body : null,
    share_build: !!r.share_build,
    share_writing: !!r.share_writing,
  }));
  return json(env, { feed, weeks: WEEKS, open_week: openWeek() });
}

// Legacy endpoint (week-1 Canvas cards, cached pre-share-flags clients):
// keeps `visibility` and `share_writing` in sync so feed/instructor reads
// agree regardless of which endpoint a client hits.
async function handleVisibility(request, env, id) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(env, { error: 'bad_request' }, 400);
  }
  const visibility = body.visibility;
  if (visibility !== 'private' && visibility !== 'class') {
    return json(env, { error: 'bad_visibility' }, 400);
  }

  const res = await env.DB.prepare(
    'UPDATE submissions SET visibility = ?, share_writing = ? WHERE id = ? AND student_id = ?'
  ).bind(visibility, visibility === 'class' ? 1 : 0, id, me.id).run();
  if (!res.meta || res.meta.changes !== 1) {
    return json(env, { error: 'not_found' }, 404);
  }
  return json(env, { ok: true, id: Number(id), visibility });
}

// New per-field share toggle — used by the site-native submission cards
// (build link and writing share independently).
async function handleShare(request, env, id) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json(env, { error: 'bad_request' }, 400);
  }
  const field = body.field;
  if (field !== 'build' && field !== 'writing') {
    return json(env, { error: 'bad_field' }, 400);
  }
  const value = !!body.value;
  const column = field === 'build' ? 'share_build' : 'share_writing';

  const res = await env.DB.prepare(
    `UPDATE submissions SET ${column} = ? WHERE id = ? AND student_id = ?`
  ).bind(value ? 1 : 0, id, me.id).run();
  if (!res.meta || res.meta.changes !== 1) {
    return json(env, { error: 'not_found' }, 404);
  }
  return json(env, { ok: true, id: Number(id), field, value });
}

async function handleLogout(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256hex(token)).run();
  }
  return json(env, { ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

// ---------------------------------------------------------------------------
// Class board — posts visible to signed-in classmates only (never public).
// Authors edit/delete their own; instructor posts are pinned "From Aaron".
// ---------------------------------------------------------------------------

const BOARD_KINDS = ['build', 'resource', 'question', 'learning'];
const BOARD_LIMITS = { title: 140, body: 2000, link: 2000 };

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Classmate';
}

function boardRow(r, me) {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link_url: r.link_url,
    pinned: !!r.pinned,
    from_instructor: !!r.is_instructor,
    author: firstName(r.name),
    created_at: r.created_at,
    updated_at: r.updated_at,
    mine: r.student_id === me.id,
    pod_id: r.pod_id ?? null,
    pod_name: r.pod_name ?? null,
  };
}

// --- Pods ------------------------------------------------------------------
// A post with pod_id NULL is whole-class. A post with a pod_id is visible (read,
// comment, edit, delete) only to that pod's members and the instructor. Membership
// rows are never removed when pod sets change, so past members keep reading history.

const todayISO = () => nowISO().slice(0, 10);

async function currentPodSet(env) {
  const today = todayISO();
  return env.DB.prepare(
    `SELECT id, name, starts_on, ends_on FROM pod_sets
      WHERE starts_on <= ? AND (ends_on IS NULL OR ends_on >= ?)
      ORDER BY starts_on DESC, id DESC LIMIT 1`
  ).bind(today, today).first();
}

async function currentPodFor(env, studentId) {
  const set = await currentPodSet(env);
  if (!set) return null;
  return env.DB.prepare(
    `SELECT p.id, p.name FROM pods p JOIN pod_members m ON m.pod_id = p.id
      WHERE p.pod_set_id = ? AND m.student_id = ? ORDER BY p.id LIMIT 1`
  ).bind(set.id, studentId).first();
}

async function canSeePod(env, me, podId) {
  if (podId == null) return true;
  if (me.is_instructor) return true;
  const m = await env.DB.prepare('SELECT 1 AS ok FROM pod_members WHERE pod_id = ? AND student_id = ?')
    .bind(podId, me.id).first();
  return !!m;
}

async function podMembers(env, podId) {
  const r = await env.DB.prepare(
    `SELECT s.name FROM pod_members m JOIN students s ON s.id = m.student_id
      WHERE m.pod_id = ? ORDER BY s.name`
  ).bind(podId).all();
  return r.results.map((x) => firstName(x.name));
}

async function handleMePod(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  const today = todayISO();
  const set = await currentPodSet(env);
  const out = { current: null, past: [] };
  if (me.is_instructor) {
    out.pods = [];
    if (set) {
      const pods = await env.DB.prepare('SELECT id, name FROM pods WHERE pod_set_id = ? ORDER BY id').bind(set.id).all();
      for (const p of pods.results) out.pods.push({ id: p.id, name: p.name, set_name: set.name, members: await podMembers(env, p.id) });
    }
    const past = await env.DB.prepare(
      `SELECT p.id, p.name, ps.name AS set_name FROM pods p JOIN pod_sets ps ON ps.id = p.pod_set_id
        WHERE ps.ends_on IS NOT NULL AND ps.ends_on < ? ORDER BY ps.starts_on DESC, p.id`
    ).bind(today).all();
    out.past = past.results;
    return json(env, out);
  }
  const cur = await currentPodFor(env, me.id);
  if (cur) out.current = { id: cur.id, name: cur.name, set_name: set.name, members: await podMembers(env, cur.id) };
  const past = await env.DB.prepare(
    `SELECT p.id, p.name, ps.name AS set_name FROM pods p
       JOIN pod_sets ps ON ps.id = p.pod_set_id
       JOIN pod_members m ON m.pod_id = p.id
      WHERE m.student_id = ? AND ps.ends_on IS NOT NULL AND ps.ends_on < ?
      ORDER BY ps.starts_on DESC, p.id`
  ).bind(me.id, today).all();
  out.past = past.results;
  return json(env, out);
}

function boardFields(body) {
  const title = String(body.title || '').trim();
  const note = String(body.body || '').trim();
  const link = String(body.link_url || '').trim();
  const kind = String(body.kind || 'learning');
  if (!title) return { error: 'title_required' };
  if (title.length > BOARD_LIMITS.title) return { error: 'title_too_long' };
  if (note.length > BOARD_LIMITS.body) return { error: 'body_too_long' };
  if (link && (link.length > BOARD_LIMITS.link || !isHttpUrl(link))) return { error: 'bad_link' };
  if (!BOARD_KINDS.includes(kind)) return { error: 'bad_kind' };
  return { title, body: note || null, link_url: link || null, kind };
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function boardGet(env, id, me) {
  const r = await env.DB.prepare(
    `SELECT p.*, s.name, s.is_instructor, pd.name AS pod_name FROM board_posts p
       JOIN students s ON s.id = p.student_id
       LEFT JOIN pods pd ON pd.id = p.pod_id WHERE p.id = ?`
  ).bind(id).first();
  return r ? boardRow(r, me) : null;
}

async function handleBoardList(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'class';
  if (scope !== 'class' && scope !== 'pod') return json(env, { error: 'bad_scope' }, 400);
  let podId = null;
  let pod = null;
  if (scope === 'pod') {
    const raw = url.searchParams.get('pod_id');
    if (raw != null) {
      if (!/^\d+$/.test(raw)) return json(env, { error: 'bad_pod' }, 400);
      podId = Number(raw);
      const row = await env.DB.prepare('SELECT id, name FROM pods WHERE id = ?').bind(podId).first();
      if (!row || !(await canSeePod(env, me, podId))) return json(env, { error: 'forbidden' }, 403);
      pod = row;
    } else if (me.is_instructor) {
      return json(env, { error: 'pod_required' }, 400);
    } else {
      pod = await currentPodFor(env, me.id);
      if (!pod) return json(env, { error: 'no_pod' }, 404);
      podId = pod.id;
    }
  }
  const where = scope === 'pod' ? 'p.pod_id = ?' : 'p.pod_id IS NULL';
  const args = scope === 'pod' ? [podId] : [];
  const rows = await env.DB.prepare(
    `SELECT p.*, s.name, s.is_instructor, pd.name AS pod_name FROM board_posts p
       JOIN students s ON s.id = p.student_id
       LEFT JOIN pods pd ON pd.id = p.pod_id
      WHERE ${where}
      ORDER BY p.pinned DESC, p.created_at DESC LIMIT 300`
  ).bind(...args).all();
  const crows = await env.DB.prepare(
    `SELECT c.*, s.name, s.is_instructor FROM board_comments c
       JOIN students s ON s.id = c.student_id
       JOIN board_posts p ON p.id = c.post_id
      WHERE ${where}
      ORDER BY c.created_at ASC, c.id ASC`
  ).bind(...args).all();
  const byPost = new Map();
  for (const c of crows.results) {
    if (!byPost.has(c.post_id)) byPost.set(c.post_id, []);
    byPost.get(c.post_id).push(commentRow(c, me));
  }
  return json(env, {
    posts: rows.results.map((r) => ({ ...boardRow(r, me), comments: byPost.get(r.id) || [] })),
    me: { first_name: firstName(me.name), is_instructor: !!me.is_instructor },
    kinds: BOARD_KINDS,
    scope,
    pod: pod ? { id: pod.id, name: pod.name } : null,
  });
}

async function handleBoardCreate(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  const body = await readJson(request);
  if (!body) return json(env, { error: 'bad_request' }, 400);
  const f = boardFields(body);
  if (f.error) return json(env, { error: f.error }, 400);
  let podId = null;
  if (body.pod === true || body.pod_id != null) {
    if (me.is_instructor && body.pod_id != null) {
      const row = await env.DB.prepare('SELECT id FROM pods WHERE id = ?').bind(Number(body.pod_id)).first();
      if (!row) return json(env, { error: 'bad_pod' }, 400);
      podId = row.id;
    } else if (body.pod === true) {
      const cur = await currentPodFor(env, me.id);
      if (!cur) return json(env, { error: 'no_pod' }, 400);
      podId = cur.id;
    }
  }
  const now = nowISO();
  const pinned = me.is_instructor ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO board_posts (student_id, kind, title, body, link_url, pinned, created_at, updated_at, pod_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(me.id, f.kind, f.title, f.body, f.link_url, pinned, now, now, podId).run();
  const row = await env.DB.prepare(
    'SELECT id FROM board_posts WHERE student_id = ? AND created_at = ? ORDER BY id DESC LIMIT 1'
  ).bind(me.id, now).first();
  return json(env, { ok: true, post: await boardGet(env, row.id, me) }, 201);
}

async function handleBoardUpdate(request, env, id) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  const body = await readJson(request);
  if (!body) return json(env, { error: 'bad_request' }, 400);
  const f = boardFields(body);
  if (f.error) return json(env, { error: f.error }, 400);
  const existing = await env.DB.prepare('SELECT pod_id FROM board_posts WHERE id = ?').bind(id).first();
  if (!existing || !(await canSeePod(env, me, existing.pod_id))) return json(env, { error: 'not_found' }, 404);
  const res = await env.DB.prepare(
    `UPDATE board_posts SET kind = ?, title = ?, body = ?, link_url = ?, updated_at = ?
      WHERE id = ? AND student_id = ?`
  ).bind(f.kind, f.title, f.body, f.link_url, nowISO(), id, me.id).run();
  if (!res.meta || res.meta.changes !== 1) return json(env, { error: 'not_found' }, 404);
  return json(env, { ok: true, post: await boardGet(env, id, me) });
}

async function handleBoardDelete(request, env, id) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  const own = await env.DB.prepare('SELECT id, pod_id FROM board_posts WHERE id = ? AND student_id = ?')
    .bind(id, me.id).first();
  if (!own || !(await canSeePod(env, me, own.pod_id))) return json(env, { error: 'not_found' }, 404);
  await env.DB.prepare('DELETE FROM board_comments WHERE post_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM board_posts WHERE id = ? AND student_id = ?').bind(id, me.id).run();
  return json(env, { ok: true, id: Number(id) });
}

// Comments: plain text only (the client renders with textContent and
// autolinks http(s) URLs as real anchors; no HTML is ever interpreted).
const COMMENT_MAX = 1000;

function commentRow(c, me) {
  return {
    id: c.id,
    post_id: c.post_id,
    body: c.body,
    author: firstName(c.name),
    from_instructor: !!c.is_instructor,
    created_at: c.created_at,
    updated_at: c.updated_at,
    mine: c.student_id === me.id,
    can_delete: c.student_id === me.id || !!me.is_instructor,
  };
}

function commentBody(body) {
  const text = String((body && body.body) || '').trim();
  if (!text) return { error: 'comment_required' };
  if (text.length > COMMENT_MAX) return { error: 'comment_too_long' };
  return { text };
}

async function commentGet(env, id, me) {
  const c = await env.DB.prepare(
    `SELECT c.*, s.name, s.is_instructor FROM board_comments c
       JOIN students s ON s.id = c.student_id WHERE c.id = ?`
  ).bind(id).first();
  return c ? commentRow(c, me) : null;
}

async function handleCommentCreate(request, env, postId) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  const f = commentBody(await readJson(request));
  if (f.error) return json(env, { error: f.error }, 400);
  const post = await env.DB.prepare('SELECT id, pod_id FROM board_posts WHERE id = ?').bind(postId).first();
  if (!post || !(await canSeePod(env, me, post.pod_id))) return json(env, { error: 'not_found' }, 404);
  const now = nowISO();
  await env.DB.prepare(
    'INSERT INTO board_comments (post_id, student_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(postId, me.id, f.text, now, now).run();
  const row = await env.DB.prepare(
    'SELECT id FROM board_comments WHERE student_id = ? AND post_id = ? ORDER BY id DESC LIMIT 1'
  ).bind(me.id, postId).first();
  return json(env, { ok: true, comment: await commentGet(env, row.id, me) }, 201);
}

// A comment is as visible as its post: pod comments need pod membership (or instructor).
async function commentVisible(env, me, commentId) {
  const r = await env.DB.prepare(
    'SELECT p.pod_id FROM board_comments c JOIN board_posts p ON p.id = c.post_id WHERE c.id = ?'
  ).bind(commentId).first();
  return !!r && (await canSeePod(env, me, r.pod_id));
}

async function handleCommentUpdate(request, env, id) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  const f = commentBody(await readJson(request));
  if (f.error) return json(env, { error: f.error }, 400);
  if (!(await commentVisible(env, me, id))) return json(env, { error: 'not_found' }, 404);
  const res = await env.DB.prepare(
    'UPDATE board_comments SET body = ?, updated_at = ? WHERE id = ? AND student_id = ?'
  ).bind(f.text, nowISO(), id, me.id).run();
  if (!res.meta || res.meta.changes !== 1) return json(env, { error: 'not_found' }, 404);
  return json(env, { ok: true, comment: await commentGet(env, id, me) });
}

async function handleCommentDelete(request, env, id) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!(await commentVisible(env, me, id))) return json(env, { error: 'not_found' }, 404);
  const res = me.is_instructor
    ? await env.DB.prepare('DELETE FROM board_comments WHERE id = ?').bind(id).run()
    : await env.DB.prepare('DELETE FROM board_comments WHERE id = ? AND student_id = ?').bind(id, me.id).run();
  if (!res.meta || res.meta.changes !== 1) return json(env, { error: 'not_found' }, 404);
  return json(env, { ok: true, id: Number(id) });
}

// ---------------------------------------------------------------------------
// Final demo sign-up (demo_slots, demo_settings: 0011). Signed-in only, never
// public. Two days (DEMO_DAYS, from semester.json), 13 ten-minute slots each.
// A student holds at most one slot and can claim, move, retitle or release it
// until the instructor's lock time; a day also closes to students on its own
// morning. Students see classmates' first names and titles only. The
// instructor reorders (swap), moves between days, adds guests, sets the lock
// and opens the sign-up. While it is closed (signup_open = 0, the default),
// students get { open: false } and no links appear, except for the throwaway
// preview accounts in the DEMO_PREVIEW var, so the flow can be tested in
// production without reaching anyone.
// ---------------------------------------------------------------------------

const isDemoPreview = (env, me) => !!me && String(env.DEMO_PREVIEW || '').split(',')
  .map((s) => s.trim().toLowerCase()).filter(Boolean).includes(String(me.email || '').toLowerCase());

async function demoSettings(env) {
  const r = await env.DB.prepare('SELECT signup_open, lock_at FROM demo_settings WHERE id = 1').first();
  return { signup_open: !!r?.signup_open, lock_at: r?.lock_at || null };
}

const demoLocked = (settings, now = Date.now()) => !!settings.lock_at && Date.parse(settings.lock_at) <= now;
const demoDay = (date) => DEMO_DAYS.find((d) => d.date === date) || null;
// Students can't change a day's slots from that day's morning (Denver) on.
const demoDayClosed = (date, now = Date.now()) => denverToday(now) >= date;

async function demoRows(env) {
  return (await env.DB.prepare(
    `SELECT d.id, d.day, d.position, d.student_id, d.guest_name, d.title, s.name AS student_name
       FROM demo_slots d LEFT JOIN students s ON s.id = d.student_id
      ORDER BY d.day, d.position`
  ).all()).results;
}

// Both days, 13 slots each. `full` (instructor): full names and row ids;
// otherwise first names only and nothing that identifies a row.
function demoDays(rows, me, full, now = Date.now()) {
  return DEMO_DAYS.map((d) => {
    const taken = new Map(rows.filter((r) => r.day === d.date).map((r) => [r.position, r]));
    const slots = [];
    for (let p = 1; p <= DEMO_SLOTS; p++) {
      const r = taken.get(p);
      const slot = { position: p, time: slotTime(d.starts, p), taken: !!r };
      if (r) {
        const name = r.student_id != null ? r.student_name : r.guest_name;
        Object.assign(slot, {
          name: full ? name : firstName(name),
          title: r.title,
          guest: r.student_id == null,
          mine: r.student_id != null && r.student_id === me.id,
        });
        if (full) Object.assign(slot, { id: r.id, student_id: r.student_id });
      }
      slots.push(slot);
    }
    return {
      date: d.date, label: dayLabel(d.date), title: d.title, starts: d.starts,
      start_label: slotTime(d.starts, 1), closed: demoDayClosed(d.date, now), slots,
    };
  });
}

function demoMine(rows, me) {
  const r = rows.find((x) => x.student_id === me.id);
  return demoMineRow(r);
}

function demoMineRow(r) {
  if (!r) return null;
  return { day: r.day, label: dayLabel(r.day), position: r.position, title: r.title, time: slotTime(demoDay(r.day)?.starts, r.position) };
}

// What the student page shows. Closed (and not a preview account): nothing.
async function demoState(env, me) {
  const settings = await demoSettings(env);
  const preview = isDemoPreview(env, me);
  if (!settings.signup_open && !preview && !me.is_instructor) return { open: false };
  const now = Date.now();
  const rows = await demoRows(env);
  return {
    open: true,
    preview: !settings.signup_open,
    locked: demoLocked(settings, now),
    lock_at: settings.lock_at,
    minutes_per_slot: DEMO_MINUTES,
    title_max: DEMO_TITLE_MAX,
    can_claim: !me.is_instructor,
    days: demoDays(rows, me, false, now),
    mine: demoMine(rows, me),
  };
}

// For the home page and /me: is the sign-up linked for this visitor? An
// optional extra: a D1 hiccup reads as "not linked", never breaks the caller.
async function demoLink(env, me) {
  try {
    const settings = await demoSettings(env);
    const linked = settings.signup_open || isDemoPreview(env, me);
    if (!linked || !me) return { linked };
    const r = await env.DB.prepare('SELECT day, position, title FROM demo_slots WHERE student_id = ?').bind(me.id).first();
    return { linked, mine: demoMineRow(r) };
  } catch (err) {
    console.error('demo link failed:', err.message);
    return { linked: false };
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' };
const isUnique = (err) => /UNIQUE/i.test(String(err && err.message));

async function handleDemoStatus(request, env) {
  const me = await currentStudent(request, env);
  const { linked } = await demoLink(env, me);
  return json(env, { linked }, 200, NO_STORE);
}

// `?as=<id>`: the instructor sees a student's page, read-only (view-as contract).
async function handleDemos(request, env) {
  const viewer = await currentStudent(request, env);
  if (!viewer) return json(env, { error: 'unauthorized' }, 401, NO_STORE);
  const { target, error } = await viewAsTarget(request, env, viewer);
  if (error) return error;
  const state = await demoState(env, target || viewer);
  if (target) Object.assign(state, { can_claim: false, read_only: true });
  return json(env, state, 200, NO_STORE);
}

// The checks every student write shares: signed in, a student, open (or a
// preview account), not locked. Returns { me } or { error }.
async function demoStudentGate(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return { error: json(env, { error: 'unauthorized' }, 401, NO_STORE) };
  if (me.is_instructor) return { error: json(env, { error: 'instructor_uses_instructor_view' }, 403, NO_STORE) };
  const settings = await demoSettings(env);
  if (!settings.signup_open && !isDemoPreview(env, me)) return { error: json(env, { error: 'not_open' }, 403, NO_STORE) };
  if (demoLocked(settings)) return { error: json(env, { error: 'locked' }, 403, NO_STORE) };
  return { me };
}

function demoTitle(raw) {
  const title = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!title) return { error: 'title_required' };
  if (title.length > DEMO_TITLE_MAX) return { error: 'title_too_long' };
  return { title };
}

function demoTarget(body) {
  const day = demoDay(String(body.day || ''));
  if (!day) return { error: 'bad_day' };
  const position = Number(body.position);
  if (!Number.isInteger(position) || position < 1 || position > DEMO_SLOTS) return { error: 'bad_position' };
  return { day: day.date, position };
}

// Claim a slot, or move to another one, or retitle: a student's one row.
async function handleDemoClaim(request, env) {
  const { me, error } = await demoStudentGate(request, env);
  if (error) return error;
  const body = await readJson(request);
  if (!body) return json(env, { error: 'bad_request' }, 400, NO_STORE);
  const t = demoTarget(body);
  if (t.error) return json(env, { error: t.error }, 400, NO_STORE);
  const f = demoTitle(body.title);
  if (f.error) return json(env, { error: f.error }, 400, NO_STORE);
  const mine = await env.DB.prepare('SELECT id, day FROM demo_slots WHERE student_id = ?').bind(me.id).first();
  if (demoDayClosed(t.day) || (mine && demoDayClosed(mine.day))) return json(env, { error: 'day_closed' }, 403, NO_STORE);
  const now = nowISO();
  let changed = 0;
  try {
    const res = mine
      ? await env.DB.prepare('UPDATE demo_slots SET day = ?, position = ?, title = ?, updated_at = ? WHERE id = ? AND student_id = ?')
        .bind(t.day, t.position, f.title, now, mine.id, me.id).run()
      : await env.DB.prepare(
        'INSERT INTO demo_slots (day, position, student_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(t.day, t.position, me.id, f.title, now, now).run();
    changed = res.meta?.changes ?? 0;
  } catch (err) {
    if (!isUnique(err)) throw err;
  }
  if (changed !== 1) {
    // Someone else holds the slot, or their own row changed under them (a
    // second tab, or the instructor moved or removed it): send the fresh list.
    const holder = await env.DB.prepare('SELECT student_id FROM demo_slots WHERE day = ? AND position = ?').bind(t.day, t.position).first();
    const error = holder && holder.student_id !== me.id ? 'slot_taken' : 'changed';
    return json(env, { error, ...(await demoState(env, me)) }, 409, NO_STORE);
  }
  return json(env, { ok: true, ...(await demoState(env, me)) }, 200, NO_STORE);
}

async function handleDemoRelease(request, env) {
  const { me, error } = await demoStudentGate(request, env);
  if (error) return error;
  const mine = await env.DB.prepare('SELECT id, day FROM demo_slots WHERE student_id = ?').bind(me.id).first();
  if (!mine) return json(env, { error: 'not_found' }, 404, NO_STORE);
  if (demoDayClosed(mine.day)) return json(env, { error: 'day_closed' }, 403, NO_STORE);
  await env.DB.prepare('DELETE FROM demo_slots WHERE id = ? AND student_id = ?').bind(mine.id, me.id).run();
  return json(env, { ok: true, ...(await demoState(env, me)) }, 200, NO_STORE);
}

async function demoInstructorGate(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return { error: json(env, { error: 'unauthorized' }, 401, NO_STORE) };
  if (!me.is_instructor) return { error: json(env, { error: 'forbidden' }, 403, NO_STORE) };
  return { me };
}

async function demoInstructorState(env, me) {
  const [settings, rows, students] = await Promise.all([
    demoSettings(env),
    demoRows(env),
    env.DB.prepare(
      `SELECT s.id, s.name FROM students s
        WHERE s.is_instructor = 0 AND NOT EXISTS (SELECT 1 FROM demo_slots d WHERE d.student_id = s.id)
        ORDER BY s.name`
    ).all(),
  ]);
  return {
    settings: { ...settings, locked: demoLocked(settings) },
    minutes_per_slot: DEMO_MINUTES,
    title_max: DEMO_TITLE_MAX,
    days: demoDays(rows, me, true),
    // Rows on a night that is no longer in semester.json: shown so they can be moved or removed.
    elsewhere: rows.filter((r) => !demoDay(r.day)).map((r) => ({
      id: r.id, day: r.day, position: r.position, title: r.title, guest: r.student_id == null,
      name: r.student_id != null ? r.student_name : r.guest_name,
    })),
    not_signed_up: students.results.map((s) => ({ id: s.id, name: s.name })),
  };
}

async function handleInstructorDemos(request, env) {
  const { me, error } = await demoInstructorGate(request, env);
  if (error) return error;
  return json(env, await demoInstructorState(env, me), 200, NO_STORE);
}

// Move one entry to (day, position). If someone holds that slot, the two swap,
// so up/down, drag and "other day" are all the same operation. The swap runs
// as one batch (a transaction): the moving row parks at a negative position
// first so the unique (day, position) index never sees two rows in one slot.
async function handleInstructorDemoMove(request, env) {
  const { me, error } = await demoInstructorGate(request, env);
  if (error) return error;
  const body = await readJson(request);
  if (!body) return json(env, { error: 'bad_request' }, 400, NO_STORE);
  const t = demoTarget(body);
  if (t.error) return json(env, { error: t.error }, 400, NO_STORE);
  if (!Number.isInteger(body.id)) return json(env, { error: 'bad_id' }, 400, NO_STORE);
  const a = await env.DB.prepare('SELECT id, day, position FROM demo_slots WHERE id = ?').bind(body.id).first();
  if (!a) return json(env, { error: 'not_found' }, 404, NO_STORE);
  if (a.day !== t.day || a.position !== t.position) {
    const b = await env.DB.prepare('SELECT id FROM demo_slots WHERE day = ? AND position = ?').bind(t.day, t.position).first();
    const now = nowISO();
    const put = (id, day, pos) => env.DB.prepare('UPDATE demo_slots SET day = ?, position = ?, updated_at = ? WHERE id = ?')
      .bind(day, pos, now, id);
    try {
      if (b) await env.DB.batch([put(a.id, a.day, -a.id), put(b.id, a.day, a.position), put(a.id, t.day, t.position)]);
      else await put(a.id, t.day, t.position).run();
    } catch (err) {
      if (!isUnique(err)) throw err;
      return json(env, { error: 'slot_taken', ...(await demoInstructorState(env, me)) }, 409, NO_STORE);
    }
  }
  return json(env, { ok: true, ...(await demoInstructorState(env, me)) }, 200, NO_STORE);
}

// A guest or auditor (not on the roster) in an open slot.
async function handleInstructorDemoGuest(request, env) {
  const { me, error } = await demoInstructorGate(request, env);
  if (error) return error;
  const body = await readJson(request);
  if (!body) return json(env, { error: 'bad_request' }, 400, NO_STORE);
  const t = demoTarget(body);
  if (t.error) return json(env, { error: t.error }, 400, NO_STORE);
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return json(env, { error: 'name_required' }, 400, NO_STORE);
  if (name.length > DEMO_NAME_MAX) return json(env, { error: 'name_too_long' }, 400, NO_STORE);
  const f = demoTitle(body.title);
  if (f.error) return json(env, { error: f.error }, 400, NO_STORE);
  const now = nowISO();
  try {
    await env.DB.prepare(
      'INSERT INTO demo_slots (day, position, guest_name, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(t.day, t.position, name, f.title, now, now).run();
  } catch (err) {
    if (!isUnique(err)) throw err;
    return json(env, { error: 'slot_taken', ...(await demoInstructorState(env, me)) }, 409, NO_STORE);
  }
  return json(env, { ok: true, ...(await demoInstructorState(env, me)) }, 201, NO_STORE);
}

// Fix a title (anyone's) or a guest's name.
async function handleInstructorDemoEdit(request, env, id) {
  const { me, error } = await demoInstructorGate(request, env);
  if (error) return error;
  const body = await readJson(request);
  if (!body) return json(env, { error: 'bad_request' }, 400, NO_STORE);
  const row = await env.DB.prepare('SELECT id, student_id, guest_name, title FROM demo_slots WHERE id = ?').bind(id).first();
  if (!row) return json(env, { error: 'not_found' }, 404, NO_STORE);
  const f = demoTitle(body.title ?? row.title);
  if (f.error) return json(env, { error: f.error }, 400, NO_STORE);
  let name = row.guest_name;
  if (body.name != null) {
    if (row.student_id != null) return json(env, { error: 'not_a_guest' }, 400, NO_STORE);
    name = String(body.name).trim().replace(/\s+/g, ' ');
    if (!name) return json(env, { error: 'name_required' }, 400, NO_STORE);
    if (name.length > DEMO_NAME_MAX) return json(env, { error: 'name_too_long' }, 400, NO_STORE);
  }
  await env.DB.prepare('UPDATE demo_slots SET title = ?, guest_name = ?, updated_at = ? WHERE id = ?')
    .bind(f.title, name, nowISO(), id).run();
  return json(env, { ok: true, ...(await demoInstructorState(env, me)) }, 200, NO_STORE);
}

async function handleInstructorDemoDelete(request, env, id) {
  const { me, error } = await demoInstructorGate(request, env);
  if (error) return error;
  const res = await env.DB.prepare('DELETE FROM demo_slots WHERE id = ?').bind(id).run();
  if (!res.meta || res.meta.changes !== 1) return json(env, { error: 'not_found' }, 404, NO_STORE);
  return json(env, { ok: true, ...(await demoInstructorState(env, me)) }, 200, NO_STORE);
}

// Open/close the sign-up (this is the feature flag) and set or clear the lock.
async function handleInstructorDemoSettings(request, env) {
  const { me, error } = await demoInstructorGate(request, env);
  if (error) return error;
  const body = await readJson(request);
  if (!body) return json(env, { error: 'bad_request' }, 400, NO_STORE);
  const cur = await demoSettings(env);
  const open = body.signup_open === undefined ? cur.signup_open : body.signup_open;
  if (typeof open !== 'boolean') return json(env, { error: 'bad_signup_open' }, 400, NO_STORE);
  let lockAt = cur.lock_at;
  if (body.lock_at !== undefined) {
    if (body.lock_at === null || body.lock_at === '') lockAt = null;
    else if (typeof body.lock_at === 'string' && !Number.isNaN(Date.parse(body.lock_at))) lockAt = new Date(body.lock_at).toISOString();
    else return json(env, { error: 'bad_lock_at' }, 400, NO_STORE);
  }
  await env.DB.prepare(
    `INSERT INTO demo_settings (id, signup_open, lock_at, updated_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET signup_open = excluded.signup_open, lock_at = excluded.lock_at,
       updated_at = excluded.updated_at`
  ).bind(open ? 1 : 0, lockAt, nowISO()).run();
  return json(env, { ok: true, ...(await demoInstructorState(env, me)) }, 200, NO_STORE);
}

async function handleInstructorDemoExport(request, env) {
  const { me, error } = await demoInstructorGate(request, env);
  if (error) return error;
  const days = demoDays(await demoRows(env), me, true);
  return new Response(runningOrderText(days), {
    status: 200,
    headers: { ...corsHeaders(env), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------------------
// Router
// Class media (R2): signed-in classmates only. Files with student names (the class film) live here,
// never in the public static site. Supports Range so video can seek on phones.
async function handleMedia(request, env, key) {
  const me = await currentStudent(request, env);
  if (!me) return new Response('Sign in at https://cu.learnvibe.build/account/ to watch this.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!env.MEDIA) return new Response('not configured', { status: 503 });
  return r2Response(request, env.MEDIA, key, { 'Cache-Control': 'private, max-age=3600' }, true);
}

// Gift videos (R2 GIFTS, gift/<student_id>.mp4, written by tools/publish_gift_videos.py):
// a one-minute film per student. Only that student, or an instructor, may fetch it; the
// ownership check comes before the bucket so a classmate can't learn whether one exists.
const giftKey = (studentId) => `gift/${Number(studentId)}.mp4`;

// Optional extras: an R2 hiccup leaves the field out, never breaks /me or the roster.
async function giftFor(env, studentId) {
  if (!env.GIFTS) return null;
  try {
    const obj = await env.GIFTS.head(giftKey(studentId));
    return obj ? { url: `/gift/${Number(studentId)}` } : null;
  } catch (err) {
    console.error('gift head failed:', err.message);
    return null;
  }
}

// Student ids that have a gift video (one listing, for the instructor roster).
async function giftIds(env) {
  const ids = new Set();
  if (!env.GIFTS) return ids;
  try {
    let cursor;
    do {
      const page = await env.GIFTS.list({ prefix: 'gift/', cursor });
      for (const o of page.objects) {
        const m = o.key.match(/^gift\/(\d+)\.mp4$/);
        if (m) ids.add(Number(m[1]));
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } catch (err) {
    console.error('gift list failed:', err.message);
  }
  return ids;
}

async function handleGift(request, env, id) {
  const noStore = { 'Cache-Control': 'no-store' };
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401, noStore);
  if (me.id !== Number(id) && !me.is_instructor) return json(env, { error: 'forbidden' }, 403, noStore);
  if (!env.GIFTS) return json(env, { error: 'not_configured' }, 503, noStore);
  return r2Response(request, env.GIFTS, giftKey(id), {
    ...corsHeaders(env),
    'Content-Type': 'video/mp4',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
}

// An R2 object as a response, honoring a single Range (video seeks on phones).
// `useStoredType` takes Content-Type from the object, else `headers` sets it.
async function r2Response(request, bucket, key, headers, useStoredType = false) {
  const range = request.headers.get('Range');
  let r2range;
  const m = range && range.match(/^bytes=(\d*)-(\d*)$/);
  if (m) {
    if (m[1] === '') r2range = { suffix: Number(m[2]) };
    else r2range = m[2] === '' ? { offset: Number(m[1]) } : { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
  }
  const obj = await bucket.get(key, r2range ? { range: r2range } : undefined);
  if (!obj) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const out = new Headers({ ...headers, 'Accept-Ranges': 'bytes' });
  if (useStoredType) out.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  if (r2range && obj.range) {
    const start = obj.range.offset ?? (obj.size - obj.range.suffix);
    const len = obj.range.length ?? (obj.size - start);
    out.set('Content-Range', `bytes ${start}-${start + len - 1}/${obj.size}`);
    out.set('Content-Length', String(len));
    return new Response(obj.body, { status: 206, headers: out });
  }
  out.set('Content-Length', String(obj.size));
  return new Response(obj.body, { status: 200, headers: out });
}

// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // Public read-only MCP server (lessons only); its own CORS, before the site CORS.
    if (path === '/mcp') return handleMcp(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(env),
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // View-as is read-only: any write carrying `as` is refused outright.
    if (url.searchParams.has('as') && request.method !== 'GET') {
      return json(env, { error: 'read_only' }, 403);
    }

    try {
      const media = path.match(/^\/media\/([a-z0-9][a-z0-9._-]*)$/);
      if (media && (request.method === 'GET' || request.method === 'HEAD')) return handleMedia(request, env, media[1]);
      const gift = path.match(/^\/gift\/(\d+)$/);
      if (gift && (request.method === 'GET' || request.method === 'HEAD')) return handleGift(request, env, gift[1]);
      if (path === '/instructor/students' && request.method === 'GET') return handleInstructorStudents(request, env);
      if (path === '/instructor/student' && request.method === 'GET') return handleInstructorStudent(request, env);
      if (path === '/instructor/signin-link' && request.method === 'POST') return handleInstructorSigninLink(request, env);
      if (path === '/instructor/files' && request.method === 'GET') return handleInstructorFiles(request, env);
      const file = path.match(/^\/instructor\/file\/(\d+)\/(p\d+|rendition)$/);
      if (file && (request.method === 'GET' || request.method === 'HEAD')) return handleInstructorFile(request, env, file[1], file[2]);
      if (path === '/demos/status' && request.method === 'GET') return handleDemoStatus(request, env);
      if (path === '/demos' && request.method === 'GET') return handleDemos(request, env);
      if (path === '/demos/claim' && request.method === 'POST') return handleDemoClaim(request, env);
      if (path === '/demos/claim' && request.method === 'DELETE') return handleDemoRelease(request, env);
      if (path === '/instructor/demos' && request.method === 'GET') return handleInstructorDemos(request, env);
      if (path === '/instructor/demos/move' && request.method === 'POST') return handleInstructorDemoMove(request, env);
      if (path === '/instructor/demos/guest' && request.method === 'POST') return handleInstructorDemoGuest(request, env);
      if (path === '/instructor/demos/settings' && request.method === 'POST') return handleInstructorDemoSettings(request, env);
      if (path === '/instructor/demos/export' && request.method === 'GET') return handleInstructorDemoExport(request, env);
      const demoEntry = path.match(/^\/instructor\/demos\/(\d+)$/);
      if (demoEntry && request.method === 'PATCH') return handleInstructorDemoEdit(request, env, Number(demoEntry[1]));
      if (demoEntry && request.method === 'DELETE') return handleInstructorDemoDelete(request, env, Number(demoEntry[1]));
      if (path === '/auth/request' && request.method === 'POST') return handleAuthRequest(request, env);
      if (path === '/auth/callback' && request.method === 'GET') return handleAuthCallbackPage(request, env);
      if (path === '/auth/callback' && request.method === 'POST') return handleAuthCallbackConsume(request, env);
      if (path === '/auth/logout' && request.method === 'POST') return handleLogout(request, env);
      if (path === '/me' && request.method === 'GET') return handleMe(request, env);
      if (path === '/me/pod' && request.method === 'GET') return handleMePod(request, env);
      if (path === '/me/final-project-prompt' && request.method === 'GET') return handleFinalProjectPrompt(request, env);
      if (path === '/feed' && request.method === 'GET') return handleFeed(request, env);
      if (path === '/submissions' && request.method === 'POST') return handleSubmit(request, env);
      if (path === '/instructor/data' && request.method === 'GET') return handleInstructorData(request, env);
      if (path === '/admin/reads' && request.method === 'POST') return handleReadsUpsert(request, env);
      if (path === '/admin/reads' && request.method === 'GET') return handleReadsList(request, env);
      const readDel = path.match(/^\/admin\/reads\/(\d+)\/([a-z0-9-]+)$/);
      if (readDel && request.method === 'DELETE') return handleReadsDelete(request, env, readDel[1], readDel[2]);
      const vis = path.match(/^\/submissions\/(\d+)\/visibility$/);
      if (vis && request.method === 'POST') return handleVisibility(request, env, vis[1]);
      const share = path.match(/^\/submissions\/(\d+)\/share$/);
      if (share && request.method === 'POST') return handleShare(request, env, share[1]);
      if (path === '/board' && request.method === 'GET') return handleBoardList(request, env);
      if (path === '/board' && request.method === 'POST') return handleBoardCreate(request, env);
      const newComment = path.match(/^\/board\/(\d+)\/comments$/);
      if (newComment && request.method === 'POST') return handleCommentCreate(request, env, newComment[1]);
      const comment = path.match(/^\/board\/comments\/(\d+)$/);
      if (comment && request.method === 'PATCH') return handleCommentUpdate(request, env, comment[1]);
      if (comment && request.method === 'DELETE') return handleCommentDelete(request, env, comment[1]);
      const post = path.match(/^\/board\/(\d+)$/);
      if (post && request.method === 'PATCH') return handleBoardUpdate(request, env, Number(post[1]));
      if (post && request.method === 'DELETE') return handleBoardDelete(request, env, Number(post[1]));
      return json(env, { error: 'not_found' }, 404);
    } catch (err) {
      console.error('unhandled:', err.stack || err.message);
      return json(env, { error: 'server_error' }, 500);
    }
  },
};
