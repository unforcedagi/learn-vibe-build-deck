# Walkthrough: the instructor's sign-in link button

Narrated video (39 s, tailnet only): https://uni.taildf9ce2.ts.net:8444/walkthrough-signin-link-66386e40.mp4

Recorded on production with throwaway accounts (e2e-test@, e2e-test2@, e2e-instructor@); no real
student appears. The link on screen was used up in the same run and its row deleted afterwards.

Run it: `python3 tools/prod_e2e_signin_link.py seed <dir>`, then
`python3 tools/prod_e2e_signin_link.py check <dir>` (API checks) and
`PLAYWRIGHT=<path>/node_modules/playwright node tools/prod_walkthrough_signin_link.mjs <dir>/tokens.json <shots>`,
then `python3 tools/prod_e2e_signin_link.py clean <dir>`. Without production:
`PLAYWRIGHT=... node tools/e2e_signin_link.mjs [shots]` runs the same steps over the fixture class.

1. **The Sign-in card** (`walkthrough/signin-link/01-signin-card.png`)
   "Each student's instructor page now has a Sign-in card. It lists their recent sign-in links: when each was made, how it went out, and what the email service said."
2. **Make a link** (`02-link-made.png`)
   "When a student's email never arrives, Aaron presses Make a sign-in link. He gets a one-time link, good for thirty minutes, and copies it to give them."
3. **The student opens it** (`03-student-opens-link.png`)
   "The student opens it on their own phone and presses Sign in."
4. **Signed in** (`04-student-signed-in.png`)
   "They land on their account, signed in."
5. **Only once** (`05-second-use-refused.png`)
   "The same link, opened again, is refused."
6. **Shown as used** (`06-link-used.png`)
   "Back on the instructor page, the link shows as used, next to the emailed link and its send status."
