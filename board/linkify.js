// Split plain text into text and link segments. Never produces HTML: the
// board renders text segments with textContent and links as <a> elements
// whose href is a validated http(s) URL. Pure function, tested in Node.
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const TRAIL = /[.,;:!?)\]]+$/;

export function linkSegments(text) {
  const out = [];
  const s = String(text ?? '');
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(TRAIL);
    if (trail) url = url.slice(0, -trail[0].length);
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    let ok = false;
    try { ok = ['http:', 'https:'].includes(new URL(url).protocol); } catch { ok = false; }
    out.push(ok ? { href: url, text: url } : { text: url });
    last = m.index + url.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
