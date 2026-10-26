// "Copy my final project prompt": the Week 9 prompt with the signed-in
// student's own semester filled in by the Worker (/me/final-project-prompt,
// scoped to the session). Signed out, or if the Worker can't answer, the
// generic prompt with a paste slot. Used on /lessons/week-9/ (any
// [data-fp-prompt] box) and on My journey (mountFinalProjectPrompt).
import { API_BASE } from '../account/config.js';
import { genericPrompt, GENERIC_SLOT } from './fp-prompt-template.js?v=1';

const ACCOUNT = new URL('../account/', import.meta.url).href;
const JOURNEY = new URL('../account/journey/', import.meta.url).href;
const PASTE_NOTE = 'Paste this into Claude, ChatGPT or any AI you use.';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function copyButton(label, text, preview) {
  const row = el('div', 'fp-actions');
  const btn = el('button', 'btn', label);
  btn.type = 'button';
  const msg = el('span', 'hint');
  msg.setAttribute('role', 'status');
  btn.onclick = async () => {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      msg.textContent = 'Copied ✓';
    } catch {
      // No clipboard (http preview, some in-app browsers): select the preview instead.
      const r = document.createRange();
      r.selectNodeContents(preview);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      msg.textContent = 'Selected: now copy it.';
    }
  };
  row.append(btn, msg);
  return row;
}

function previewBox(text) {
  const pre = el('pre', 'fp-preview');
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', 'Prompt preview');
  pre.append(el('code', null, text));
  return pre;
}

function personal(box, d) {
  const preview = previewBox(d.prompt);
  const what = d.submissions || d.posts
    ? `It already holds your semester: ${plural(d.submissions, 'weekly submission', 'weekly submissions')} and ${plural(d.posts, 'class board post', 'class board posts')}, with their links. Only you get yours.`
    : "You haven't submitted anything on the course site yet, so the prompt says so. Tell the AI about your work in the conversation instead.";
  box.replaceChildren(
    el('p', 'kicker', 'Your final project prompt'),
    el('p', null, what),
    copyButton('Copy my final project prompt', d.prompt, preview),
    el('p', 'hint fp-size', `${d.chars.toLocaleString('en-US')} characters. ${PASTE_NOTE}`),
  );
  if (d.trimmed) {
    box.append(el('p', 'hint fp-trimmed', 'Your history is long, so the oldest writing is shortened to fit. Every week title and link is still in it.'));
  }
  box.append(preview);
}

// signIn false: the page already shows its own sign-in box (My journey).
function generic(box, { signedOut, signIn }) {
  const text = genericPrompt();
  const preview = previewBox(text);
  box.replaceChildren(el('p', 'kicker', 'Your final project prompt'));
  if (signedOut) {
    box.append(el('p', null, `Sign in${signIn ? '' : ' above'} to copy this prompt with your own semester already in it.`));
    if (signIn) {
      const a = el('a', 'btn', 'Sign in');
      a.href = ACCOUNT;
      const p = el('p', 'fp-signin');
      p.append(a);
      box.append(p);
    }
  } else {
    box.append(el('p', 'hint', "Your personal prompt couldn't load right now. Use the generic one, or try again in a minute."));
  }
  const how = el('p', null, 'Or copy the generic version, and paste your earlier submissions and project links where it says ');
  how.append(el('code', null, GENERIC_SLOT), document.createTextNode('.'));
  if (signIn) {
    const j = el('a', null, 'My journey');
    j.href = JOURNEY;
    how.append(document.createTextNode(' Once you\'re signed in, '), j, document.createTextNode(' can copy them as markdown.'));
  }
  box.append(how, copyButton('Copy the generic prompt', text, preview),
    el('p', 'hint fp-size', `${text.length.toLocaleString('en-US')} characters. ${PASTE_NOTE}`), preview);
}

// signedOut true: the page already knows (My journey's /me said 401), so skip the request.
export async function mountFinalProjectPrompt(box, { as = null, signIn = true, signedOut = false } = {}) {
  box.classList.add('fp-prompt');
  if (signedOut) return generic(box, { signedOut, signIn });
  box.classList.add('is-loading');
  let res = null;
  try {
    res = await fetch(API_BASE + '/me/final-project-prompt' + (as ? `?as=${encodeURIComponent(as)}` : ''), { credentials: 'include' });
  } catch { /* network: generic below */ }
  box.classList.remove('is-loading');
  if (res && res.ok) {
    try { return personal(box, await res.json()); } catch { /* bad body: generic */ }
  }
  generic(box, { signedOut: !!res && res.status === 401, signIn });
}

document.querySelectorAll('[data-fp-prompt]').forEach((box) => mountFinalProjectPrompt(box));
