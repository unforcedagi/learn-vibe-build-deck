# Walkthrough: "Copy my final project prompt"

## How to run it
- Locally, no production data: `PLAYWRIGHT=/home/uni/.local/share/mise/installs/npm-playwright/1.64.0/node_modules/playwright node tools/e2e_fp_prompt.mjs walkthrough`
  serves this checkout at https://cu.learnvibe.build and answers api.learnvibe.build with the real Worker code
  over the fixture class (e2e-test@learnvibe.build, e2e-test-2@learnvibe.build; invented text). It writes the screenshots below.
- Live, after the PR is merged and the Worker is deployed: https://cu.learnvibe.build/lessons/week-9/#3-your-final-project-prompt and https://cu.learnvibe.build/account/journey/

## Steps
1. **Week 9, signed in** (`walkthrough/01-week9-signed-in-desktop.png`, `-phone.png`)
   "Section 3 of the Week 9 page now has one button. Signed in, it copies the final project prompt with your whole semester already in it."
2. **What's in it** (scroll the preview in the same screen)
   "The preview shows exactly what gets copied: every weekly submission with its week title, date and link, then your own board posts. The length is shown, and a note says to paste it into any AI."
3. **Week 9, signed out** (`walkthrough/02-week9-signed-out-desktop.png`, `-phone.png`)
   "Signed out, there's a sign-in button, and the generic prompt with a clear slot to paste your own work."
4. **My journey, signed in** (`walkthrough/03-journey-signed-in-desktop.png`, `-phone.png`)
   "The same button sits at the top of My journey, so it's where students already look back at their weeks."
5. **My journey, signed out** (`walkthrough/04-journey-signed-out-desktop.png`, `-phone.png`)
   "Signed out, My journey points to its sign-in box and still offers the generic prompt."
