"""Week 6 kit: HTML slide view, handout page, AGENTS.md template, downloads, and the
"Everything for Week 6" block on the lesson page. Run AFTER tools/build_lessons.py.

Inputs come from ~/Code/teaching/week6 when present (slides.json, handout, deck files),
copied into lessons/week-6/_src so the site builds from the repo alone.
Also writes the instructor-only pages (teach card, demo script) to the tailnet
class-files server (~/.local/share/uni/class) in the same visual style. Those never
enter this repo.
"""
import html, json, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(__file__))
import markdown
from build_lessons import page

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "lessons/week-6"
SRC = f"{OUT}/_src"
TEACH = os.path.expanduser("~/Code/teaching/week6")
os.makedirs(SRC, exist_ok=True)
for f in ["slides.json", "get-your-project-online.md", "week6-lecture.pdf", "week6-lecture.pptx"]:
    if os.path.exists(f"{TEACH}/{f}"):
        shutil.copy(f"{TEACH}/{f}", f"{SRC}/{f}")

esc = html.escape
MD = lambda t: markdown.markdown(t, extensions=["tables", "fenced_code", "sane_lists"])


def autolink(h):
    parts = re.split(r"(<pre.*?</pre>|<code>.*?</code>|<a [^>]*>.*?</a>)", h, flags=re.S)
    return "".join(p if i % 2 else re.sub(r"(https?://[^\s<)]+[^\s<).,;:])", r'<a href="\1">\1</a>', p)
                   for i, p in enumerate(parts))


# ---------------------------------------------------------------- downloads
os.makedirs(f"{OUT}/files", exist_ok=True)
shutil.copy(f"{SRC}/week6-lecture.pdf", f"{OUT}/files/week6-slides.pdf")
shutil.copy(f"{SRC}/week6-lecture.pptx", f"{OUT}/files/week6-slides.pptx")

# ---------------------------------------------------------------- slides (HTML)
slides = json.load(open(f"{SRC}/slides.json"))


def slide_html(i, s, n):
    k, t, b, extra = s["kind"], s["title"], s["bullets"], s.get("extra")
    foot = f'<footer><span>Week 6 · {esc(s["section"])}</span><span>{i} / {n}</span></footer>'
    if k == "title":
        inner = f'<p class="k">Learn, Vibe, Build · Week 6</p><h1>{esc(t)}</h1><p class="sub">{esc(b[0])}</p><p class="date">{esc(b[1])}</p>'
        return f'<section class="slide title">{inner}{foot}</section>'
    body = ""
    if k == "code":
        body = '<div class="two"><pre>' + esc("\n".join(b)) + f'</pre><p class="cap">{esc(extra or "")}</p></div>'
    else:
        body = "<ul>" + "".join(f"<li>{autolink(esc(x))}</li>" for x in b) + "</ul>"
        if k == "flow" and extra:
            body = '<div class="flow">' + '<span class="arr">→</span>'.join(
                f'<span class="step{" first" if j == 0 else ""}">{esc(x)}</span>' for j, x in enumerate(extra)) + "</div>" + body
    return f'<section class="slide"><h2>{esc(t)}</h2>{body}{foot}</section>'


def slides_page(with_notes=False, css_href="../../../assets/site.css", back="../"):
    n = len(slides)
    secs = []
    for i, s in enumerate(slides, 1):
        h = slide_html(i, s, n)
        if with_notes:
            h = h.replace("</section>", f'<aside class="notes">{esc(s["notes"])}</aside></section>', 1) if False else h
        secs.append(h)
    notes = ""
    if with_notes:
        notes = '<div id="notes" class="notesbar"></div><script>window.NOTES=' + json.dumps([s["notes"] for s in slides]) + ';</script>'
    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Week 6 slides — Learn, Vibe, Build</title>
<link rel="stylesheet" href="{css_href}">
<style>
html,body{{margin:0;height:100%;background:#1f211d;overflow:hidden}}
.deck{{position:fixed;inset:0;display:grid;place-items:center}}
.slide{{display:none;box-sizing:border-box;width:min(100vw,177.78vh);aspect-ratio:16/9;background:var(--bg);color:var(--ink);
  container-type:inline-size;padding:5.5cqw 7cqw 6cqw;position:relative;border-left:1.2cqw solid var(--accent);font-family:var(--body)}}
.slide.on{{display:flex;flex-direction:column}}
.slide h1{{font-family:var(--display);font-weight:600;font-size:7.4cqw;line-height:1.02;letter-spacing:-.03em;margin:auto 0 1.5cqw}}
.slide h2{{font-family:var(--display);font-weight:600;font-size:3.9cqw;line-height:1.1;letter-spacing:-.02em;margin:0 0 3cqw;text-wrap:balance}}
.slide .k{{color:var(--accent);text-transform:uppercase;letter-spacing:.14em;font-size:1.3cqw;font-weight:600;margin:0}}
.slide .sub{{font-size:2.6cqw;color:var(--muted);margin:0 0 1cqw}} .slide .date{{font-size:1.6cqw;color:var(--accent);margin:0 0 auto}}
.slide ul{{margin:0;padding:0;list-style:none;font-size:2.35cqw;line-height:1.35}}
.slide li{{padding:.9cqw 0 .9cqw 2.6cqw;position:relative;border-top:1px solid var(--border)}}
.slide li:before{{content:"";position:absolute;left:0;top:1.85cqw;width:1cqw;height:1cqw;border-radius:50%;background:var(--accent)}}
.slide a{{color:var(--accent)}}
.two{{display:grid;grid-template-columns:1.55fr 1fr;gap:3.5cqw;align-items:center}}
.slide pre{{margin:0;background:var(--soft);border:1px solid var(--border);border-radius:1cqw;padding:2.4cqw;font-size:1.75cqw;line-height:1.5;white-space:pre-wrap}}
.cap{{font-family:var(--display);font-size:2.5cqw;line-height:1.2;color:var(--accent);margin:0}}
.flow{{display:flex;align-items:center;gap:1cqw;margin:0 0 3cqw;flex-wrap:wrap}}
.step{{background:var(--ink);color:var(--bg);padding:1.2cqw 2cqw;border-radius:.8cqw;font-weight:600;font-size:1.9cqw}} .step.first{{background:var(--accent)}}
.arr{{color:var(--muted);font-size:2.2cqw}}
.slide footer{{position:absolute;left:7cqw;right:4cqw;bottom:2.2cqw;display:flex;justify-content:space-between;font-size:1.15cqw;color:var(--muted)}}
.ctl{{position:fixed;top:12px;right:14px;display:flex;gap:6px;z-index:5;font:600 13px/1 var(--body);opacity:.35;transition:opacity .2s}} .ctl:hover,.ctl:focus-within{{opacity:1}} @media (hover:none){{.ctl{{opacity:.9;top:auto;bottom:14px}}}}
.ctl a,.ctl button{{background:rgba(255,253,247,.92);border:1px solid #888;border-radius:6px;padding:8px 11px;color:#272a25;text-decoration:none;cursor:pointer;font:inherit;display:inline-flex;align-items:center}}
.notesbar{{position:fixed;left:0;right:0;bottom:0;max-height:38vh;overflow:auto;background:#fffdf7;border-top:3px solid var(--accent);padding:12px 16px 50px;font:15px/1.5 var(--body);white-space:pre-wrap;display:none}}
body.shownotes .notesbar{{display:block}}
@media (max-width:700px) and (orientation:portrait){{.deck{{place-items:center}} .ctl{{bottom:16px}}}}
</style></head>
<body>
<div class="deck">{"".join(secs)}</div>
{notes}
<div class="ctl"><a href="{back}">Back to Week 6</a><button id="prev" aria-label="Previous slide">←</button><button id="next" aria-label="Next slide">→</button>{'<button id="nb">Notes</button>' if with_notes else ''}<button id="fs">Full screen</button>
<a href="{'files/' if back == './' else '../files/'}week6-slides.pdf">PDF</a></div>
<script>
var S=[].slice.call(document.querySelectorAll('.slide')),i=0;
function go(n){{i=Math.max(0,Math.min(S.length-1,n));S.forEach(function(s,j){{s.classList.toggle('on',j===i)}});history.replaceState(null,'','#'+(i+1));
 var nb=document.getElementById('notes');if(nb&&window.NOTES)nb.textContent=NOTES[i];}}
go((parseInt(location.hash.slice(1))||1)-1);
document.addEventListener('keydown',function(e){{if(['ArrowRight','PageDown',' '].indexOf(e.key)>=0){{e.preventDefault();go(i+1)}}
 else if(['ArrowLeft','PageUp'].indexOf(e.key)>=0){{e.preventDefault();go(i-1)}} else if(e.key==='f')fs(); else if(e.key==='n')document.body.classList.toggle('shownotes');
 else if(e.key==='Home')go(0); else if(e.key==='End')go(S.length-1);}});
document.getElementById('next').onclick=function(){{go(i+1)}};document.getElementById('prev').onclick=function(){{go(i-1)}};
function fs(){{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(function(){{}})}}
document.getElementById('fs').onclick=fs; var nb=document.getElementById('nb'); if(nb)nb.onclick=function(){{document.body.classList.toggle('shownotes')}};
var x0=null;document.addEventListener('touchstart',function(e){{x0=e.touches[0].clientX}});
document.addEventListener('touchend',function(e){{if(x0===null)return;var d=e.changedTouches[0].clientX-x0;if(Math.abs(d)>40)go(i+(d<0?1:-1));x0=null}});
</script></body></html>'''


os.makedirs(f"{OUT}/slides", exist_ok=True)
open(f"{OUT}/slides/index.html", "w").write(slides_page())

# ---------------------------------------------------------------- handout page
hand = open(f"{SRC}/get-your-project-online.md").read()
shutil.copy(f"{SRC}/get-your-project-online.md", f"{OUT}/files/get-your-project-online.md")
hbody_md = re.sub(r"^# .+\n", "", hand, count=1)
hbody = f'''<header class="lesson-header">
  <p class="crumb"><a href="../../">Lessons</a> / <a href="../">Week 6</a> / Handout</p>
  <p class="kicker">Week 6 handout</p>
  <h1>Get your project online</h1>
  <div class="copybar">
    <button class="btn" type="button" data-copy="../files/get-your-project-online.md">Copy handout as markdown</button>
    <a class="btn ghost" href="../">Everything for Week 6</a>
  </div>
</header>
<div class="lesson-layout single"><article class="lesson">
{autolink(MD(hbody_md))}
</article></div>
<script>
document.querySelectorAll('[data-copy]').forEach(function (b) {{
  b.addEventListener('click', function () {{
    fetch(b.getAttribute('data-copy')).then(function (r) {{ return r.text(); }}).then(function (t) {{ return navigator.clipboard.writeText(t); }})
    .then(function () {{ var o = b.textContent; b.textContent = 'Copied ✓'; setTimeout(function () {{ b.textContent = o; }}, 1800); }})
    .catch(function () {{ location.href = b.getAttribute('data-copy'); }});
  }});
}});
</script>'''
os.makedirs(f"{OUT}/get-online", exist_ok=True)
open(f"{OUT}/get-online/index.html", "w").write(page("Get your project online", "../../../", hbody))

# ---------------------------------------------------------------- the kit block
KIT = f'''<section class="week-kit" id="everything" aria-labelledby="kit-title">
  <p class="kicker">Week 6 · slides, lesson, handout, demo project, reading</p>
  <h2 id="kit-title">Everything for Week 6</h2>
  <div class="kit-grid">
    <a class="kit-card" href="slides/"><span class="kicker">Slides</span><strong>Open the slides</strong><span>Arrow keys and full screen. PDF and PowerPoint downloads are below.</span></a>
    <a class="kit-card" href="#lesson-start"><span class="kicker">Lesson</span><strong>Read the lesson</strong><span>Below on this page. Copy it as markdown for your AI.</span></a>
    <a class="kit-card" href="get-online/"><span class="kicker">Handout</span><strong>Get your project online</strong><span>Repo, commit, push, deploy: a link anyone can open.</span></a>
    <a class="kit-card" href="../../readings/"><span class="kicker">Reading</span><strong>How to Get Better at AI by Asking AI</strong><span>Arielle Shipper, Every. Free link on your account page and Canvas.</span></a>
  </div>
  <p class="hint">Downloads: <a href="files/week6-slides.pdf">slides (PDF)</a> · <a href="files/week6-slides.pptx">slides (PowerPoint)</a> · <a href="lesson.md">lesson (.md)</a> · <a href="files/get-your-project-online.md">handout (.md)</a></p>
</section>
<span id="lesson-start"></span>
'''
KIT_JS = '''<script>
document.querySelectorAll('[data-copy-text]').forEach(function (b) {
  b.addEventListener('click', function () { navigator.clipboard.writeText(b.getAttribute('data-copy-text')).then(function () {
    var o = b.textContent; b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = o; }, 1800); }); });
});
</script>'''
p = f"{OUT}/index.html"
h = open(p).read()
if "week-kit" not in h:
    h = h.replace('<div class="lesson-layout">', KIT + '<div class="lesson-layout">', 1)
    h = h.replace("</main>", KIT_JS + "\n</main>", 1)
    h = re.sub(r'<a class="btn ghost" href="[^"]*">Open the slides</a>', '<a class="btn ghost" href="slides/">Open the slides</a>', h)
    open(p, "w").write(h)

# check ids used by the kit exist
for anchor in []:
    if f'id="{anchor}"' not in h:
        print("WARN missing anchor", anchor)

# ---------------------------------------------------------------- instructor pages (tailnet only)
CLASS = os.path.expanduser("~/.local/share/uni/class")
if os.path.isdir(CLASS):
    os.makedirs(f"{CLASS}/assets/fonts", exist_ok=True)
    shutil.copy("assets/site.css", f"{CLASS}/assets/site.css")
    for f in os.listdir("assets/fonts"):
        shutil.copy(f"assets/fonts/{f}", f"{CLASS}/assets/fonts/{f}")
    css = '<link rel="stylesheet" href="../assets/site.css">'

    def ipage(title, inner, prefix="../"):
        return f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} — instructor</title><link rel="stylesheet" href="{prefix}assets/site.css"></head>
<body class="lesson-page"><main class="lesson-main" id="main-content">
<header class="lesson-header"><p class="crumb"><a href="{prefix}">Instructor</a> / Week 6</p><p class="kicker">Instructor only · tailnet</p><h1>{esc(title)}</h1></header>
<div class="lesson-layout single"><article class="lesson">{inner}</article></div></main></body></html>'''
    W6 = f"{CLASS}/week6"
    os.makedirs(W6, exist_ok=True)
    for name, title in [("teach-card", "Teach card"), ("demo-script", "Demo script")]:
        src = f"{TEACH}/{name}.md"
        if os.path.exists(src):
            t = re.sub(r"^# .+\n", "", open(src).read(), count=1)
            open(f"{W6}/{name}.html", "w").write(ipage(title, autolink(MD(t))))
    open(f"{W6}/slides.html", "w").write(slides_page(with_notes=True, css_href="../assets/site.css", back="./"))
    shutil.copy(f"{SRC}/week6-lecture.pdf", f"{W6}/week6-lecture.pdf")
    shutil.copy(f"{SRC}/week6-lecture.pptx", f"{W6}/week6-lecture.pptx")
    os.makedirs(f"{W6}/files", exist_ok=True)
    shutil.copy(f"{SRC}/week6-lecture.pdf", f"{W6}/files/week6-slides.pdf")
    links = [("https://cu.learnvibe.build/lessons/week-6/", "Everything for Week 6 (the student page)"),
             ("week6/slides.html", "Present: slides with speaker notes (press N)"),
             ("week6/teach-card.html", "Teach card"), ("week6/demo-script.html", "Demo script, with fallbacks"),
             ("week6/week6-lecture.pptx", "Slides (PowerPoint)"), ("week6/week6-lecture.pdf", "Slides (PDF)")]
    cards = "".join(f'<a class="kit-card" href="{u}"><strong>{esc(t)}</strong></a>' for u, t in links)
    open(f"{CLASS}/index.html", "w").write(f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instructor — Week 6</title><link rel="stylesheet" href="assets/site.css"></head>
<body class="lesson-page"><main class="lesson-main" id="main-content">
<header class="lesson-header"><p class="kicker">Instructor only · tailnet</p><h1>Week 6, tonight</h1></header>
<section class="week-kit"><div class="kit-grid">{cards}</div></section></main></body></html>''')
print("week6 kit built:", len(slides), "slides")
