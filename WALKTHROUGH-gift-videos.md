# Walkthrough: gift videos on each student's account page

Narrated video (40 s, tailnet only): https://uni.taildf9ce2.ts.net:8444/walkthrough-gift-videos-22a61a84.mp4

Recorded on production with throwaway accounts (e2e-test@, e2e-test2@, e2e-instructor@) and a
test-pattern video; no real student appears. Screenshots 01-03 and 05 are from production;
04 is the fixed instructor student page served from this branch over the fixture class.

Run it: `python3 tools/prod_e2e_gift.py seed <dir> <test.mp4>`, then
`PLAYWRIGHT=<path>/node_modules/playwright node tools/e2e_gift.mjs <test.mp4> <shots> --prod <dir>/tokens.json`,
then `python3 tools/prod_e2e_gift.py clean <dir>`. Locally, drop `--prod`.

1. **The account page** (`walkthrough/gift-videos/01-account-gift.png`)
   "Each student, signed in, finds a gift from Aaron right under their name: a one-minute film made from what they built this semester."
2. **It plays and seeks** (`02-account-gift-seeked.png`)
   "It plays on the page, and it seeks, so they can jump to any moment."
3. **On a phone** (`03-phone-gift.png`)
   "On a phone it fits the screen."
4. **Private to them** (`05-classmate-forbidden.png`)
   "A second student has no film box, and opening the first student's video link directly is refused."
5. **The instructor view** (`04-instructor-student-gift.png`)
   "Aaron sees each student's film on their student page, and a Gift video link on their roster row."
