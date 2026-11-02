# Walkthrough: uploaded files, readable in the instructor view

Screenshots are from the real pages served from this branch, with the API
answered by the real Worker code over the fixture class. The uploads are
invented files (a PDF, a Word doc, an RTF, an HTML page and a PNG) rendered by
the real sync code. No real student appears.

Run it: `PLAYWRIGHT=<path>/node_modules/playwright node tools/e2e_instructor_files.mjs walkthrough`
On prod: sign in as the instructor, open https://cu.learnvibe.build/instructor/,
pick a week, and click a student's row, or open their **Student page →**.

1. **A PDF, as pages** (`walkthrough/01-pdf-pages.png`)
   "Uploads used to be a Canvas download link. Now each file is a card on the page. A PDF shows its pages right here."
   "The Canvas link is still there, small, top right: Original on Canvas."

2. **A Word doc, as text** (`walkthrough/02-docx-text.png`)
   "Every file also has its text pulled out. Word, RTF and slides get pages too, so you can read either way. The tabs switch."

3. **An HTML build, running safely** (`walkthrough/03-html-sandboxed.png`)
   "An HTML upload opens with one click and runs in a locked-down frame. Its scripts work, but they can't see this site or your sign-in."

4. **From the roster** (`walkthrough/04-roster-detail.png`)
   "On the roster, the row names the file instead of linking to a download. Click the row and the files open in place, under their writing and Canvas comment."

5. **On a phone** (`walkthrough/05-phone-pdf.png`, `walkthrough/06-phone-docx-text.png`)
   "It reads on a phone too: pages fit the screen, and the text tab is easier to read there."

Kept fresh: the `lvb-canvas-sync` timer runs `resync.py --files` after the daily sync, so new uploads show up after the 6 AM run (and Mondays after noon). Students never see any of this; they get 403.
