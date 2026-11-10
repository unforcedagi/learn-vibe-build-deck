"""Narrated walkthrough of the demo sign-up: the stills from tools/walkthrough_demos.mjs, one Kokoro line per scene,
a quiet music bed that changes chord with each scene and ducks under the voice. Landscape 1920x1080.

    node tools/walkthrough_demos.mjs walkthrough/demo-signup          # the stills (fictional class)
    ~/studio/.venv/bin/python ~/Code/unforced-media/video-lab/tools/kokoro_say.py lines.json voice/
    ~/Code/unforced-media/video-lab/.venv/bin/python tools/walkthrough_demos_film.py <shots> <voice> <out.mp4>

lines.json is the SCENES text below as [{"id": "s1", "text": ...}, ...].
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path.home() / 'Code/unforced-media/video-lab/tools'))
from cue import Cue  # noqa: E402

SCENES = [  # (still, voice id, chord as MIDI notes)
    ('01-home-card.png', 's1', [50, 57, 62, 66]),
    ('02-brief.png', 's2', [47, 54, 59, 62]),
    ('03-claim-form.png', 's3', [43, 50, 55, 59]),
    ('04-claimed.png', 's4', [45, 52, 57, 61]),
    ('phone', 's5', [50, 57, 62, 66]),
    ('07-instructor-order.png', 's6', [47, 54, 59, 62]),
    ('08-export.png', 's7', [43, 50, 55, 59]),
    ('09-lock.png', 's8', [45, 52, 57, 61]),
    ('10-closed.png', 's9', [50, 57, 62, 66]),
]
W, H, SR, LEAD, GAP, TAIL = 1920, 1080, 48000, 0.8, 1.1, 1.6
ACCENT = (168, 61, 43)


def ringed(img, box):
    """The still with a thin accent ring around box (x, y, w, h), clipped to the frame."""
    out = img.copy()
    x, y, w, h = box
    pad = 10
    l, t, r, b = max(4, x - pad), max(4, y - pad), min(W - 5, x + w + pad), min(H - 5, y + h + pad)
    ImageDraw.Draw(out).rounded_rectangle((l, t, r, b), radius=10, outline=ACCENT, width=5)
    return out
BG = (247, 245, 238)


def phone_frame(shots, out):
    """The 390 px phone shot at its size inside the landscape frame, with one line of large type beside it."""
    img = Image.new('RGB', (W, H), BG)
    ph = Image.open(shots / '05-phone.png').convert('RGB')
    h = 1000
    ph = ph.resize((round(ph.width * h / ph.height), h), Image.LANCZOS)
    x = 300
    ImageDraw.Draw(img).rounded_rectangle((x - 14, 26, x + ph.width + 14, 54 + h), radius=36, fill=(39, 42, 37))
    img.paste(ph, (x, 40))
    d = ImageDraw.Draw(img)
    serif = ImageFont.truetype('/usr/share/fonts/noto/NotoSerif-Regular.ttf', 84)
    sans = ImageFont.truetype('/usr/share/fonts/noto/NotoSans-Regular.ttf', 40)
    d.text((x + ph.width + 140, 400), 'Same on a phone.', font=serif, fill=(39, 42, 37))
    d.text((x + ph.width + 144, 520), '390 px wide, no sideways scroll.', font=sans, fill=(100, 102, 93))
    img.save(out)


def main(shots, voice, out):
    shots, voice, out = Path(shots).resolve(), Path(voice).resolve(), Path(out).resolve()
    work = out.parent / (out.stem + '-work')
    work.mkdir(parents=True, exist_ok=True)
    phone_frame(shots, work / 'phone.png')
    # Timeline from what was said.
    t, rows, lines = LEAD, [], []
    for still, vid, chord in SCENES:
        a, sr = sf.read(voice / f'{vid}.wav', dtype='float32')
        assert sr == 24000 or sr == SR, sr
        if sr != SR:
            a = np.interp(np.arange(0, len(a), sr / SR), np.arange(len(a)), a).astype(np.float32)
        start = t
        dur = len(a) / SR
        lines.append((start, a))
        end = start + dur + GAP
        rows.append((still, start - (LEAD if not rows else 0), end, chord))
        t = end
    total = t + TAIL - GAP
    # Voice track.
    n = int(total * SR)
    vo = np.zeros(n, np.float32)
    for start, a in lines:
        i = int(start * SR)
        vo[i:i + len(a)] += a[: n - i]
    # Music: a slow harp arpeggio over an upright root, one chord per scene; ducked under the voice.
    c = Cue('demo-signup', bpm=66)
    c.track('harp', 'harp', gain_db=-10, pan=-.2, room=-8)
    c.track('bass', 'upright', gain_db=-14, pan=.1, room=-10)
    beat = 60 / 66
    for still, s, e, chord in rows:
        c.note('bass', t=s + .05, pitch=chord[0] - 12, dur=min(e - s, 4), vel=55)
        k, tt = 0, s
        while tt < e - .2:
            c.note('harp', t=tt, pitch=chord[1 + k % 3] + (12 if k % 6 >= 3 else 0), dur=1.2, vel=48 + (k % 3) * 4)
            k, tt = k + 1, tt + beat
    mus = c.draft(total)
    mus = mus.mean(axis=1) if mus.ndim == 2 else mus
    mus = np.pad(mus, (0, max(0, n - len(mus))))[:n]
    env = np.convolve((np.abs(vo) > .01).astype(np.float32), np.ones(SR // 5) / (SR // 5), mode='same')
    duck = 10 ** ((-26 + (1 - np.clip(env * 3, 0, 1)) * 8) / 20)  # -26 dB under speech, -18 between
    peak = np.abs(mus).max() or 1
    mix = vo * .9 + mus / peak * duck
    fade = np.ones(n, np.float32)
    fade[-SR:] = np.linspace(1, 0, SR)
    mix = np.clip(mix * fade, -1, 1)
    sf.write(work / 'mix.wav', np.stack([mix, mix], 1), SR)
    # Pictures: the stills for their spans (ffmpeg concat).
    marks = json.loads((shots / 'marks.json').read_text()) if (shots / 'marks.json').exists() else {}
    lst = []
    for i, (still, s, e, _) in enumerate(rows):
        src = work / 'phone.png' if still == 'phone' else shots / still
        img = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
        dur = (e - s) if i < len(rows) - 1 else total - s
        # Rings from marks.json: [x, y, w, h, at], each landing `at` seconds into the scene's line.
        rings = sorted(marks.get(still, []), key=lambda m: m[4])
        lead = LEAD if i == 0 else 0
        cuts = [0.0] + [min(m[4] + lead, dur - .2) for m in rings] + [dur]
        for j in range(len(cuts) - 1):
            f = work / f'f{i:02d}{j}.png'
            (ringed(img, rings[j - 1][:4]) if j else img).save(f)
            lst += [f"file '{f}'", f'duration {cuts[j + 1] - cuts[j]:.3f}']
    lst.append(lst[-2])
    (work / 'list.txt').write_text('\n'.join(lst) + '\n')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(work / 'list.txt'),
                    '-i', str(work / 'mix.wav'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20',
                    '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '160k', '-t', f'{total:.3f}', '-movflags', '+faststart',
                    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-empty_hdlr_name', '1', str(out)], check=True)
    print(json.dumps({'out': str(out), 'seconds': round(total, 2), 'scenes': [(r[0], round(r[1], 2), round(r[2], 2)) for r in rows]}))


if __name__ == '__main__':
    main(*sys.argv[1:4])
