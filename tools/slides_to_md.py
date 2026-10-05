"""Extract on-screen slide text (not speaker notes) from an HTML deck as markdown."""
import re, html, sys
def clean(s):
    s = re.sub(r'<span class="n">(\d+)</span>', r'\1. ', s)
    s = re.sub(r'<br\s*/?>', ' ', s); s = re.sub(r'<span class="dot">.*?</span>', ' · ', s)
    s = re.sub(r'<[^>]+>', '', s); return re.sub(r'\s+', ' ', html.unescape(s)).strip()
def deck_md(path):
    s = open(path).read(); out = []
    for sec in re.findall(r'<section[^>]*>(.*?)</section>', s, re.S):
        sec = re.sub(r'<aside class="notes">.*?</aside>', '', sec, flags=re.S)
        sec = re.sub(r'<img[^>]*>', '', sec)
        h = re.search(r'<h[12][^>]*>(.*?)</h[12]>', sec, re.S)
        title = clean(h.group(1)) if h else ''
        body = sec[h.end():] if h else sec
        eb = re.search(r'class="eyebrow">(.*?)</div>', sec, re.S)
        items = [clean(x) for x in re.findall(r'<(?:p|li|div class="step"|div class="[^"]*card[^"]*")[^>]*>(.*?)</(?:p|li|div)>', body, re.S)]
        items = [i for i in items if i and i != title]
        if not title and not items: continue
        if not title: title = items.pop(0)
        out.append(f"### {title}")
        if eb and title: out.append(f"*{clean(eb.group(1))}*")
        out += [f"- {i}" for i in items]; out.append('')
    return '\n'.join(out)
if __name__ == '__main__': print(deck_md(sys.argv[1]))
