# Walkthrough: final demo sign-up

Narrated video (74 s, landscape, tailnet only): https://uni.taildf9ce2.ts.net:8444/walkthrough-demo-signup-c9188402.mp4

What's being judged: whether the student page and your instructor view do what you asked (two nights, 13 timed
slots, one slot each, a lock, reorder, guests, a text running order), and whether the Demo day brief reads right.
It's a draft for you to approve.

Recorded from this branch's real pages and the real Worker code, run in-process over an invented class (every name is
fictional). Production isn't in it: the Worker isn't deployed yet (see the PR). The sign-up is shown as a preview
session would see it. For everyone else it stays hidden until you open it.

Run it: `PLAYWRIGHT=<path>/node_modules/playwright node tools/walkthrough_demos.mjs walkthrough/demo-signup` (stills
and `marks.json`), Kokoro for `walkthrough/demo-signup/lines.json`, then
`~/Code/unforced-media/video-lab/.venv/bin/python tools/walkthrough_demos_film.py walkthrough/demo-signup <voice-dir> out.mp4`.

1. **The home page card** (`walkthrough/demo-signup/01-home-card.png`)
   "Here is the final demo sign-up, for November thirtieth and December fourth. Once you open it, this card shows up in the This week block on the home page."
2. **The Demo day brief** (`02-brief.png`)
   "The page starts with a short Demo day brief: why it matters, what to bring, timing, and a reminder to test on the room's screen. That text is a draft for you to approve."
3. **Claiming a slot** (`03-claim-form.png`, `04-claimed.png`)
   "Each night has thirteen ten-minute slots, timed from the start of class. A student picks an open slot and types a one-line title. Their slot is highlighted. They can move it, change the title, or give it up until you lock the order. Classmates see first names and titles only."
4. **On a phone** (`05-phone.png`)
   "It works the same on a phone."
5. **Your view: reorder, guests, export, lock** (`07-instructor-order.png`, `08-export.png`, `09-lock.png`)
   "In your view, you drag people, or nudge them up and down, move them between nights, and add a guest or an auditor to any open slot. Then copy the running order as plain text, to read from on the night. Set a lock time, and after it only you can change the order. Friday's start time isn't in the calendar yet, so its slots show no times."
6. **Off until you open it** (`10-closed.png`)
   "Right now it's closed. Students see nothing until you press Open sign-up to the class."
