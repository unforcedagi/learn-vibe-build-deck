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
  const res = await fetch(
    `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(env.AGENTMAIL_INBOX)}/messages/send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.AGENTMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject: 'Your Learn Vibe Build sign-in link',
        text:
          `Here is your sign-in link for the Learn, Vibe, Build class site:\n\n` +
          `${link}\n\n` +
          `It expires in 15 minutes. This link only works for the email on ` +
          `your Canvas account.\n\n` +
          `If you didn't request this, you can ignore it.`,
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`agentmail ${res.status}: ${detail.slice(0, 300)}`);
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

  const student = await env.DB.prepare(
    'SELECT id, email FROM students WHERE email = ?'
  ).bind(email).first();
  if (!student) return json(env, { error: 'not_on_roster' }, 404);

  // Rate limit: max 3 link requests per email per 15 minutes.
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM magic_tokens WHERE email = ? AND created_at > ?'
  ).bind(email, isoAgo(MAGIC_TTL_MS)).first();
  if ((recent?.n ?? 0) >= RATE_LIMIT_MAX) {
    return json(env, { error: 'rate_limited' }, 429);
  }

  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO magic_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256hex(token), email, nowISO(), isoIn(MAGIC_TTL_MS)).run();

  const link = `${env.API_ORIGIN}/auth/callback?token=${token}`;
  try {
    await sendMagicEmail(env, email, link);
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

async function handleMe(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);

  const subs = await env.DB.prepare(
    `SELECT id, week, body, submitted_at, visibility
       FROM submissions WHERE student_id = ? ORDER BY week`
  ).bind(me.id).all();

  const out = {
    name: me.name,
    email: me.email,
    is_instructor: !!me.is_instructor,
    submissions: subs.results,
  };

  if (me.is_instructor) {
    const rows = await env.DB.prepare(
      `SELECT s.name, s.email, s.is_instructor,
              sub.id AS sub_id, sub.week, sub.body, sub.submitted_at, sub.visibility
         FROM students s
         LEFT JOIN submissions sub ON sub.student_id = s.id
        WHERE s.is_instructor = 0
        ORDER BY s.name, sub.week`
    ).all();
    const roster = new Map();
    for (const r of rows.results) {
      if (!roster.has(r.email)) roster.set(r.email, { name: r.name, email: r.email, submissions: [] });
      if (r.sub_id != null) {
        roster.get(r.email).submissions.push({
          id: r.sub_id, week: r.week, body: r.body,
          submitted_at: r.submitted_at, visibility: r.visibility,
        });
      }
    }
    out.roster = [...roster.values()];
  }

  return json(env, out);
}

async function handleFeed(request, env) {
  const me = await currentStudent(request, env);
  if (!me) return json(env, { error: 'unauthorized' }, 401);

  const rows = await env.DB.prepare(
    `SELECT sub.id, sub.week, sub.body, sub.submitted_at, s.name AS author
       FROM submissions sub JOIN students s ON s.id = sub.student_id
      WHERE sub.visibility = 'class'
      ORDER BY sub.week, s.name`
  ).all();
  return json(env, { feed: rows.results });
}

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
    'UPDATE submissions SET visibility = ? WHERE id = ? AND student_id = ?'
  ).bind(visibility, id, me.id).run();
  if (!res.meta || res.meta.changes !== 1) {
    return json(env, { error: 'not_found' }, 404);
  }
  return json(env, { ok: true, id: Number(id), visibility });
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
      const vis = path.match(/^\/submissions\/(\d+)\/visibility$/);
      if (vis && request.method === 'POST') return handleVisibility(request, env, vis[1]);
      return json(env, { error: 'not_found' }, 404);
    } catch (err) {
      console.error('unhandled:', err.stack || err.message);
      return json(env, { error: 'server_error' }, 500);
    }
  },
};
