# Walkthrough: "Start your final reflection" on My journey

What's being judged: the wording of the new prompt (it interviews; the student writes), and whether the block sits
right next to the final project prompt on My journey. Fixture data only (throwaway e2e accounts, invented text).

Run it: `PLAYWRIGHT=<path>/node_modules/playwright node tools/e2e_fp_prompt.mjs <shots-dir>`. The site is served from
this checkout; the API is the real Worker code over the fixture class in `worker/test/fixtures/fp-prompt-fixture.mjs`.

1. **Two prompts on My journey** (`walkthrough/reflection-prompt/01-journey-both-prompts-desktop.png`)
   "My journey now has a second prompt under the final project one: Start your final reflection. It gives the due
   date, Wednesday December ninth, and says plainly the reflection is the student's to write."
2. **Week 1 comes first** (`02-reflection-prompt-week1-first.png`)
   "The copied prompt opens with their Week 1 intention, labelled as the starting point, then every later
   submission and board post. The AI reminds them what they wanted, then asks a question or two at a time."
3. **On a phone** (`03-journey-phone.png`)
   "Same on a phone. The prompt text stays folded until they want to read it."
4. **Your view-as** (`04-instructor-view-as.png`)
   "When you view a student's journey, you get exactly the prompt they get."
5. **Signed out** (`05-signed-out-phone.png`, `06-signed-out-desktop.png`)
   "Signed out, both boxes point to the sign-in above and offer a generic version with a paste slot."
