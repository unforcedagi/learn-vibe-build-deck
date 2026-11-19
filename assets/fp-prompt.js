// The copyable prompts with the signed-in student's own semester filled in by
// the Worker (scoped to the session; ?as for the instructor's view-as):
// - "Copy my final project prompt" (/me/final-project-prompt): Week 9 page
//   (any [data-fp-prompt] box) and My journey (mountFinalProjectPrompt).
// - "Start your final reflection" (/me/final-reflection-prompt): My journey
//   (mountReflectionPrompt), Week 1 first as the baseline.
// Signed out, or if the Worker can't answer, the generic prompt with a paste slot.
import { API_BASE } from '../account/config.js';
import * as fpTemplate from './fp-prompt-template.js?v=2';
import * as reflectionTemplate from './reflection-prompt-template.js?v=1';

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
const counted = (d) => `${plural(d.submissions, 'weekly submission', 'weekly submissions')} and ${plural(d.posts, 'class board post', 'class board posts')}`;

const KINDS = {
  fp: {
    path: '/me/final-project-prompt',
    kicker: 'Your final project prompt',
    copy: 'Copy my final project prompt',
    template: fpTemplate,
    what: (d) => (d.submissions || d.posts
      ? `It already holds your semester: ${counted(d)}, with their links. Only you get yours.`
      : "You haven't submitted anything on the course site yet, so the prompt says so. Tell the AI about your work in the conversation instead."),
    trimmed: 'Your history is long, so the oldest writing is shortened to fit. Every week title and link is still in it.',
    signInFor: 'with your own semester already in it',
    paste: 'paste your earlier submissions and project links where it says ',
  },
  reflection: {
    path: '/me/final-reflection-prompt',
    kicker: 'Start your final reflection',
    copy: 'Copy my reflection prompt',
    template: reflectionTemplate,
    intro: 'Your Final Reflection is due Wed Dec 9, 11:59 PM, on Canvas. This prompt asks an AI to interview you, a question or two at a time, to help you remember and think. The reflection is yours to write, in your own words; the prompt tells the AI not to write it for you.',
    what: (d) => (d.submissions || d.posts
      ? `${d.week1 ? 'It starts with your Week 1 intention, then holds' : "You didn't submit Week 1 on the course site, so tell the AI what you wanted at the start. It holds"} ${counted(d)}, with their links. Only you get yours.`
      : "You haven't submitted anything on the course site yet, so the prompt says so. Tell the AI what you wanted at the start and what you did instead."),
    trimmed: 'Your history is long, so the oldest writing after Week 1 is shortened to fit. Week 1 is whole, and every week title and link is still in it.',
    signInFor: 'with your Week 1 intention and everything since already in it',
    paste: 'paste your Week 1 intention and your later work where it says ',
  },
};

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
      const fold = preview.closest('details');
      if (fold) fold.open = true;
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

// compact (My journey, two prompts on one page): the preview starts folded.
function previewBox(text, compact) {
  const pre = el('pre', 'fp-preview');
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', 'Prompt preview');
  pre.append(el('code', null, text));
  if (!compact) return pre;
  const fold = el('details', 'fp-fold');
  fold.append(el('summary', null, 'Read the prompt'), pre);
  return fold;
}

function head(box, k) {
  box.replaceChildren(el('p', 'kicker', k.kicker));
  if (k.intro) box.append(el('p', null, k.intro));
}

function personal(box, k, d, compact) {
  const shown = previewBox(d.prompt, compact);
  const preview = shown.querySelector('pre') || shown;
  head(box, k);
  box.append(
    el('p', null, k.what(d)),
    copyButton(k.copy, d.prompt, preview),
    el('p', 'hint fp-size', `${d.chars.toLocaleString('en-US')} characters. ${PASTE_NOTE}`),
  );
  if (d.trimmed) box.append(el('p', 'hint fp-trimmed', k.trimmed));
  box.append(shown);
}

// signIn false: the page already shows its own sign-in box (My journey).
function generic(box, k, { signedOut, signIn, compact }) {
  const text = k.template.genericPrompt();
  const shown = previewBox(text, compact);
  const preview = shown.querySelector('pre') || shown;
  head(box, k);
  if (signedOut) {
    box.append(el('p', null, `Sign in${signIn ? '' : ' above'} to copy this prompt ${k.signInFor}.`));
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
  const how = el('p', null, `Or copy the generic version, and ${k.paste}`);
  how.append(el('code', null, k.template.GENERIC_SLOT), document.createTextNode('.'));
  if (signIn) {
    const j = el('a', null, 'My journey');
    j.href = JOURNEY;
    how.append(document.createTextNode(' Once you\'re signed in, '), j, document.createTextNode(' can copy them as markdown.'));
  }
  box.append(how, copyButton('Copy the generic prompt', text, preview),
    el('p', 'hint fp-size', `${text.length.toLocaleString('en-US')} characters. ${PASTE_NOTE}`), shown);
}

// signedOut true: the page already knows (My journey's /me said 401), so skip the request.
async function mount(k, box, { as = null, signIn = true, signedOut = false, compact = false } = {}) {
  box.classList.add('fp-prompt');
  if (signedOut) return generic(box, k, { signedOut, signIn, compact });
  box.classList.add('is-loading');
  let res = null;
  try {
    res = await fetch(API_BASE + k.path + (as ? `?as=${encodeURIComponent(as)}` : ''), { credentials: 'include' });
  } catch { /* network: generic below */ }
  box.classList.remove('is-loading');
  if (res && res.ok) {
    try { return personal(box, k, await res.json(), compact); } catch { /* bad body: generic */ }
  }
  generic(box, k, { signedOut: !!res && res.status === 401, signIn, compact });
}

export const mountFinalProjectPrompt = (box, opts) => mount(KINDS.fp, box, opts);
export const mountReflectionPrompt = (box, opts) => mount(KINDS.reflection, box, opts);

document.querySelectorAll('[data-fp-prompt]').forEach((box) => mountFinalProjectPrompt(box));
