// Learn, Vibe, Build — student account page.
//
// Flow: enter your Canvas email -> Supabase emails a magic link -> the link
// bounces through Supabase's /verify endpoint and redirects back here with
// session tokens in the URL hash (implicit flow) -> supabase-js picks them up
// and we show the student's profile + submissions.
//
// We use the *implicit* flow deliberately, not PKCE: PKCE stores a code
// verifier in the browser that requested the link, so the email link only
// works in that same browser. Students read email everywhere; hash tokens
// work wherever the link is opened.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// ---------------------------------------------------------------------------
// Not wired yet? Show the banner and stop — safe even if this deploys early.
// ---------------------------------------------------------------------------
if (SUPABASE_URL === 'FILL_ME' || SUPABASE_ANON_KEY === 'FILL_ME') {
  show($('not-wired'));
} else {
  main();
}

function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'implicit',      // magic-link tokens arrive in the URL hash
      detectSessionInUrl: true,  // pick them up automatically on load
      persistSession: true,
    },
  });

  // If the magic link failed (expired, already used), Supabase redirects back
  // with the error in the hash instead of tokens. Surface it.
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const linkError = hashParams.get('error_description');

  show($('signin'));
  if (linkError) {
    showSigninError(`Sign-in link problem: ${linkError.replace(/\+/g, ' ')}. Request a fresh one below.`);
    history.replaceState(null, '', window.location.pathname);
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      showAccount(supabase, session);
    } else {
      hide($('account'));
      hide($('sent'));
      show($('signin'));
    }
  });

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) showAccount(supabase, session);
  });

  // -------------------------------------------------------------------------
  // Sign-in form
  // -------------------------------------------------------------------------
  $('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim().toLowerCase();
    if (!email) return;

    $('send-btn').disabled = true;
    hide($('signin-error'));

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Accounts are pre-seeded from the roster; never create new ones.
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });

    $('send-btn').disabled = false;

    if (error) {
      // shouldCreateUser:false + unknown email => "Signups not allowed for otp"
      if (error.status === 422 || /signup/i.test(error.message)) {
        showSigninError('That email isn’t on the class roster — use the email on your Canvas account.');
      } else if (error.status === 429) {
        showSigninError('Too many emails just now — wait a minute and try again.');
      } else {
        showSigninError(`Couldn’t send the link: ${error.message}`);
      }
      return;
    }

    $('sent-to').textContent = email;
    hide($('signin'));
    show($('sent'));
  });

  $('try-again').addEventListener('click', () => {
    hide($('sent'));
    show($('signin'));
    $('email').focus();
  });

  $('signout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

function showSigninError(msg) {
  const el = $('signin-error');
  el.textContent = msg;
  show(el);
}

// ---------------------------------------------------------------------------
// Signed-in view: profile + submissions (RLS means these queries can only
// ever return the student's own rows).
// ---------------------------------------------------------------------------
async function showAccount(supabase, session) {
  hide($('signin'));
  hide($('sent'));
  show($('account'));

  $('student-email').textContent = session.user.email ?? '';

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', session.user.id)
    .maybeSingle();

  $('student-name').textContent = profile?.name || session.user.email || 'Student';

  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('week, body, submitted_at, visibility')
    .eq('profile_id', session.user.id)
    .order('week', { ascending: true });

  const list = $('submissions');
  list.textContent = '';

  if (error) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = `Couldn’t load submissions: ${error.message}`;
    list.appendChild(p);
    return;
  }

  if (!submissions || submissions.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No submissions yet.';
    list.appendChild(p);
    return;
  }

  for (const sub of submissions) {
    list.appendChild(renderSubmission(sub));
  }
}

function renderSubmission(sub) {
  const card = document.createElement('div');
  card.className = 'card submission';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const week = document.createElement('span');
  week.className = 'week';
  week.textContent = `Week ${sub.week}`;
  meta.appendChild(week);

  if (sub.submitted_at) {
    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = new Date(sub.submitted_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    meta.appendChild(date);
  }

  const badge = document.createElement('span');
  badge.className = 'badge' + (sub.visibility === 'public' ? ' public' : '');
  badge.textContent = sub.visibility;
  meta.appendChild(badge);

  card.appendChild(meta);

  // Render the body as simple paragraphs; textContent keeps it safe.
  const body = document.createElement('div');
  body.className = 'body';
  for (const para of (sub.body || '').split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    const p = document.createElement('p');
    p.textContent = para.trim();
    body.appendChild(p);
  }
  card.appendChild(body);

  return card;
}
