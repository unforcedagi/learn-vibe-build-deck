// Learn, Vibe, Build — accounts API (Cloudflare Worker + D1).
//
// Auth model: passwordless magic links. We store only sha256 hashes of both
// magic-link tokens and session tokens. Sessions live in an HttpOnly cookie
// scoped to .learnvibe.build so the static site at cu.learnvibe.build can
// make credentialed same-site fetches to api.learnvibe.build.

const COOKIE_NAME = 'lvb_session';
const MAGIC_TTL_MS = 15 * 60 * 1000;         // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const RATE_LIMIT_MAX = 3;                     // per email per 15 minutes

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
  await env.EMAIL.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Your Learn Vibe Build sign-in link',
    text:
      `Here is your sign-in link for the Learn, Vibe, Build class site:\n\n` +
      `${link}\n\n` +
      `It expires in 15 minutes. This link only works for the email on ` +
      `your Canvas account.\n\n` +
      `If you didn't request this, you can ignore it.`,
  });
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
  // bucket: max 3 link requests per student per 15 minutes.
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM magic_tokens WHERE email = ? AND created_at > ?'
  ).bind(student.email, isoAgo(MAGIC_TTL_MS)).first();
  if ((recent?.n ?? 0) >= RATE_LIMIT_MAX) {
    return json(env, { error: 'rate_limited' }, 429);
  }

  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO magic_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256hex(token), student.email, nowISO(), isoIn(MAGIC_TTL_MS)).run();

  const link = `${env.API_ORIGIN}/auth/callback?token=${token}`;
  try {
    await sendMagicEmail(env, email, link); // deliver to whatever address they typed
  } catch (err) {
    console.error('magic email failed:', err.message);
    return json(env, { error: 'email_failed' }, 502);
  }
  return json(env, { ok: true });
}

async function handleAuthCallback(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const fail = () =>
    new Response(null, {
      status: 302,
      headers: { Location: `${env.SITE_ORIGIN}/account/#error=expired` },
    });

  if (!token) return fail();
  const hash = await sha256hex(token);
  const row = await env.DB.prepare(
    'SELECT token_hash, email, expires_at, used_at FROM magic_tokens WHERE token_hash = ?'
  ).bind(hash).first();
  if (!row || row.used_at || row.expires_at <= nowISO()) return fail();

  const student = await env.DB.prepare(
    'SELECT id FROM students WHERE email = ?'
  ).bind(row.email).first();
  if (!student) return fail();

  // Single use: mark consumed atomically-enough (guard on used_at IS NULL).
  const marked = await env.DB.prepare(
    'UPDATE magic_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL'
  ).bind(nowISO(), hash).run();
  if (!marked.meta || marked.meta.changes !== 1) return fail();

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
    `SELECT s.name, s.email, s.canvas_id,
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
  const roster = new Map();
  for (const r of rows.results) {
    if (!roster.has(r.email)) {
      roster.set(r.email, {
        name: r.name, email: r.email,
        on_canvas: !!r.canvas_id,
        signed_in: !!r.signed_in,
        submissions: [],
      });
    }
    if (r.sub_id != null) {
      roster.get(r.email).submissions.push({
        id: r.sub_id, week: r.week, body: r.body,
        submitted_at: r.submitted_at, link_url: r.link_url,
        share_build: !!r.share_build, share_writing: !!r.share_writing,
      });
    }
  }
  return [...roster.values()];
}

async function handleMe(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);

  const subs = await env.DB.prepare(
    `SELECT id, week, body, submitted_at, link_url, share_build, share_writing
       FROM submissions WHERE student_id = ? ORDER BY week`
  ).bind(me.id).all();

  const out = {
    name: me.name,
    email: me.email,
    is_instructor: !!me.is_instructor,
    open_week: OPEN_WEEK,
    submissions: subs.results.map((s) => ({
      ...s, share_build: !!s.share_build, share_writing: !!s.share_writing,
    })),
  };

  if (me.is_instructor) {
    out.roster = await instructorRoster(env);
  }

  return json(env, out);
}

// The week currently accepting new site-native submissions (build link +
// writing, both share flags). Bump when a new week's assignment opens.
const OPEN_WEEK = 2;
const MIN_WRITING_CHARS = 120; // roughly a short paragraph

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
  const shareBuild = !!body.share_build;
  const shareWriting = !!body.share_writing;

  if (week !== OPEN_WEEK) return json(env, { error: 'week_closed' }, 400);
  if (!isHttpUrl(linkUrl)) return json(env, { error: 'bad_link' }, 400);
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

const CURRENT_WEEK = 1; // bump as the course advances (drives the stats line)

async function handleInstructorData(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);
  if (!me.is_instructor) return json(env, { error: 'forbidden' }, 403);

  const reads = await env.DB.prepare(
    `SELECT id, week, slug, title, body, audience, updated_at
       FROM reads ORDER BY week DESC, slug`
  ).all();
  const roster = await instructorRoster(env);
  const stats = {
    total: roster.length,
    submitted: roster.filter((s) =>
      s.submissions.some((sub) => sub.week === CURRENT_WEEK)).length,
    signed_in: roster.filter((s) => s.signed_in).length,
  };
  return json(env, {
    reads: reads.results,
    roster,
    stats,
    current_week: CURRENT_WEEK,
  });
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
  const feed = rows.results.map((r) => ({
    ...r, share_build: !!r.share_build, share_writing: !!r.share_writing,
  }));
  return json(env, { feed });
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
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(env),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      if (path === '/auth/request' && request.method === 'POST') return handleAuthRequest(request, env);
      if (path === '/auth/callback' && request.method === 'GET') return handleAuthCallback(request, env);
      if (path === '/auth/logout' && request.method === 'POST') return handleLogout(request, env);
      if (path === '/me' && request.method === 'GET') return handleMe(request, env);
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
      return json(env, { error: 'not_found' }, 404);
    } catch (err) {
      console.error('unhandled:', err.stack || err.message);
      return json(env, { error: 'server_error' }, 500);
    }
  },
};
