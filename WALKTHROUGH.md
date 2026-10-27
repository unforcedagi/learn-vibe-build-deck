# Walkthrough: the instructor student page

Screenshots are from the real page served from this branch, with the API
answered by the real Worker code over the fixture class (throwaway e2e
accounts, invented text). No real student appears.

Run it: `PLAYWRIGHT=<path>/node_modules/playwright node tools/e2e_student_page.mjs walkthrough`
On prod: sign in as the instructor, open https://cu.learnvibe.build/instructor/ and
click **Student page →** under any name.

1. **Roster** (`walkthrough/01-roster-link.png`)
   "Every name on the roster now has a Student page link. Clicking the row still opens this week's work, as before."

2. **Header and AI read** (`walkthrough/02-student-header-and-read.png`)
   "The top shows their pod, when they last submitted, and a strip of every week so far: on time, late, missing, or not due yet."
   "Under it is the AI read: where they are, what they're building, strengths, where they're quiet, what might help, and one question to ask. It says when it was updated and which weeks it read."

3. **Timeline** (`walkthrough/03-student-timeline.png`)
   "Below the read is everything they turned in, week by week, with their links, and then their class-board posts."

4. **Late week and attachments** (`walkthrough/04-late-week-attachment.png`)
   "Late weeks carry a late badge. Text pulled from uploaded files stays folded until you open it."

5. **A student can't get in** (`walkthrough/05-student-denied.png`)
   "A student who opens the same address, even with their own id, sees 'This page is for Aaron' and no data. The server answers 403."

6. **Phone** (`walkthrough/06-phone.png`)
   "It reads fine on a phone too."

Kept fresh: the `lvb-canvas-sync` timer resyncs Canvas daily at 6 AM and Mondays at noon, then rewrites reads only for students whose work changed.
