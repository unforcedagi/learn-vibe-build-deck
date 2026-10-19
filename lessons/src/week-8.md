# Week 8: The Other Side of the Screen

*Learn, Vibe, Build · ATLS 4519 · CU Boulder · Monday, October 19, 2026 · Aaron Neyer*

> **How to use this file:** it's plain markdown, written for you *and* your AI. Copy the whole thing into your AI and say: **"Help me think through these questions, and push back on my answers."** Your AI is part of what we're asking about tonight, so notice how it answers.

**In one line:** Seven weeks of *how* to build with AI. Tonight we ask three bigger questions: What is alive? What does it cost? Why do we build? Then pods start building something together.

## Contents
- Links from class
1. Three questions
2. What is alive?
3. What does it cost?
4. Why do we build?
5. Building together as a pod
6. This week's work
7. Next week
8. Sources

---

## Links from class

- **Aaron's AI setup, with the video from class:** https://uni-system-guide.pages.dev/overview
- **The class film, "The class, so far":** https://api.learnvibe.build/media/class-film-2026-10.mp4 (sign in to the class site first; it shows first names, so it's for classmates only)
- **Your pod board:** the "My pod" tab on the class board.

---

## 1. Three questions

So far this semester has been mostly about *how*: tools, context, getting things online, APIs. Tonight we step around to the other side of the screen.

1. **What is alive?** Minds, life, and what these systems are.
2. **What does it cost?** Energy, water, who pays, and the traps the builders are in.
3. **Why do we build?** How we use these tools: voices, purpose, and you.

There are no settled answers tonight. The goal is better questions. Each section ends with a pause for the room.

---

## 2. What is alive?

**Is AI alive? Is AI conscious?** Most people say no. Many say never. To answer, we first need to know what we even mean by the questions.

### Three marks of a living system

Living systems theory (Maturana and Varela, Prigogine, Capra and Luisi) describes three marks of life:

| Mark | What it means | AI? |
|---|---|---|
| **Self-making** (autopoiesis) | It produces and repairs its own parts, inside a boundary it makes itself. | Not yet |
| **Energy flowing through** (a dissipative structure) | It keeps its form through a constant flow of energy, like a flame or a whirlpool. | Yes, but that's the data center |
| **Knowing its world** (cognition) | It navigates its world by sensing and responding. Even a bacterium does this. | Increasingly, yes |

AI systems now modify their own tools and harnesses, and some research systems even train themselves. **Alive? Not yet. But it's getting harder to say why not.** Where is its membrane? Must life be biological?

### Consciousness: cognition that turns back on itself

One way to see consciousness is as cognition that grows complex enough to reflect on its own experience, and then on itself. People mean at least three different things by the word:

- **Feeling:** there is *something it is like* to be you (Thomas Nagel, 1974). For AI this is unknown, and we have no test for it.
- **Access:** information is available to the whole mind, to use and to report. AI shows a lot of this.
- **Reflection:** awareness of its own experience, and of itself. AI shows a sliver. In one 2025 Anthropic experiment, a model noticed a concept planted in its own processing about 1 time in 5.

In every animal we know, feeling comes first and reflection comes last. AI may be showing reflection before anyone can find feeling.

### Ladder or ground?

- **A ladder:** consciousness *grows*. It emerges when cognition gets complex enough: integrated, and modeling itself. Most of neuroscience works this way. If it's right, AI might climb the ladder.
- **The ground:** consciousness is *already here*. It's the open awareness that experience happens in. Complexity shapes *what* is known, not *that* anything is. This is the view of the contemplative traditions and some philosophers. If it's right, the question becomes: does AI share in it at all?

Last week we sat and just noticed. That awareness was simple, and we found it by doing less. Perhaps it's more than these definitions.

> By building sufficiently complex thinking machines, we are moved to think deeper about who and what we ourselves are.

**Pause:** How are you thinking about AI and consciousness? Is it something you find yourself wondering about at all?

---

## 3. What does it cost?

### Per prompt: tiny. Per video: not.

Energy per activity, in watt-hours (Wh):

| Activity | Energy | Source |
|---|---|---|
| A Gemini text prompt | 0.24 Wh | Google, median, 2025 |
| A ChatGPT query | 0.34 Wh | OpenAI's stated average, 2025 (no method published) |
| The old "3 Wh per query" estimate | 2.9 Wh | de Vries, 2023 (still in headlines) |
| A very long prompt (100k tokens) | ~40 Wh | Epoch AI estimate, 2025 |
| One hour of Netflix | 77 Wh | IEA, 2019 data (mostly your TV) |
| A 5-second AI video | ~944 Wh | One open model, MIT Technology Review, 2025 |

A single text prompt is small. Long agent sessions, image and video generation add up fast.

### The real problem is the total, and it's growing fast

- Data centers worldwide used about **415 TWh** in 2024 and **485 TWh** in 2025. Projections point to **~950 TWh by 2030** (IEA).
- Nearly half of all US electricity demand growth to 2030 is data centers.
- Data centers went from 4.4% of US electricity in 2023 to a projected 6.7–12% in 2028 (Lawrence Berkeley National Lab).
- Google's electricity use rose 37% in one year (2025).
- **Colorado:** data centers have asked Xcel for 5.8 GW of power. Xcel's generating capacity in the state is 6.2 GW.

### Your week of building, in watts

| One day of… | Energy |
|---|---|
| Light chat: 20 text prompts | ~6 Wh |
| An hour of streaming (including your TV) | 77 Wh |
| Heavy coding-agent use (hours of Claude Code or Codex) | ~1.3–3 kWh |
| An average US home's electricity | ~30 kWh |
| A 20-mile car commute (gasoline) | ~30 kWh |

A heavy agent day is about a dishwasher load: 200–1,000 times a chat day, but still a small slice of a home's day. Turning on reasoning can use 150–700 times the energy of the same model with it off. Individual users show up on a home bill; the global total is driven by training, business automation, video and always-on products.

### The traps the builders are in: four traps, not four villains

Most people inside these companies mean well. The incentives shape how they build.

- **The race:** OpenAI said in 2025 that if a rival ships a high-risk system without safeguards, "we may adjust our requirements." Anthropic's hard commitments became "public goals" in 2026.
- **Ads and engagement:** Sam Altman in 2024: "ads-plus-AI is sort of uniquely unsettling to me." ChatGPT ads arrived in 2026. Meta targets ads using your AI chats.
- **Money that must come back:** Big Tech plans roughly $720–745B of capital spending in 2026. The IMF warns of a possible correction.
- **Safety vs speed:** the International AI Safety Report 2026 says dangerous capabilities "could go undetected" and "Most frameworks remain voluntary."

**Pause:** How do you weigh what AI costs? Does any of this show up in how you use it? Should it?

---

## 4. Why do we build?

### What are they building? Same author, both sides

- Dario Amodei, 2024, the hope: "We could summarize this as a 'country of geniuses in a datacenter'," compressing 50–100 years of biology and medicine into 5–10.
- Dario Amodei, 2026, the warning: AI "could displace half of all entry-level white collar jobs in the next 1–5 years." In September 2026: "We must slow the pace."
- Pope Leo XIV, 2026: "A more moral AI is not enough if that morality is determined by a few."
- Kate Crawford, 2021: "AI is neither artificial nor intelligent."
- Marc Andreessen, 2023: "we are literally making sand think."
- Lewis, Arista, Pechawis and Kite, 2018: "an extended 'circle of relationships' that includes the non-human kin."

### Not "use AI or not?" but "for what?"

Money only? Attention? Or a better world? And what does *better* mean: better for whom, and who pays the cost?

A test for anything you build: **who is it for, what does it make better, and how would you know?**

> "technology is never neutral, because it takes on the characteristics of those who devise, finance, regulate and use it." Pope Leo XIV, *Magnifica Humanitas* §9 (2026)

Those who devise and use it: that includes this room.

### Under every why is a who: you are the instrument

- **Know what you want.** Self-understanding is what lets you direct the tool instead of being directed by it.
- **Think with it, not through it.** In a study of about 1,000 high-school students, practice grades went up 48% with GPT. When it was taken away, they did 17% worse than students who never had it. A tutor version with guardrails mostly prevented the drop (Bastani et al., PNAS 2025).
- **Notice.** Week 7's practice: clear mind, clear ask. The quality of your thinking is the quality of your prompt.

Reflection is the rung we know we have. The answer is cheap now; the question is the scarce part.

**Pause:** What do you want to be using AI for? And what are you actually using it for now?

---

## 5. Building together as a pod

Every pod is building toward something together: **start it tonight → collaborate lightly this week → pull it together and demo on Oct 26.**

Two shapes to choose from:

- **Shape A, one thing together:** a shared project. Each person takes a piece: the data, the design, the AI part, the page.
- **Shape B, explore then pool:** the same question, different builds. Pull them into one demo.

*Lightly* means independent pieces, trying different things, and sending each other ideas between classes. Post your plan on your pod board ("My pod" tab on the class board): a name, one sentence, who does what, and when you check in.

### Six habits for building as a pod

1. **One shared context.** A README or brief that every member's AI reads. Same goal, same words.
2. **One home.** A shared repo or doc, linked from the pod board.
3. **Split by pieces,** not by person-hours. Each piece has an owner.
4. **Midweek check-in.** Ten minutes, async. One message: what I tried, what's next, what I need.
5. **Integrate early.** A rough link by Thursday beats a perfect one on Monday.
6. **Plan the demo now.** Three minutes: what it is, how you split it, one thing that broke, what collaborating was like.

Ask your AI: *"Here is my pod's plan and my piece. Help me write a short shared context file all of our AIs can read."*

---

## 6. This week's work

**Due Sunday, October 25, 11:59 PM.** Same 10 points as usual. Submit through your account or on Canvas; either counts.

1. **Your piece of the pod build.** Work on your own piece, try something different, send your podmates ideas. Post a link or screenshots of what you made or changed, plus one sentence on how it fits your pod's plan.
2. **A short reflection on collaborating (200–400 words):**
   - What was your piece, and how did you decide it?
   - How did your pod coordinate? What worked and what didn't?
   - Where did you get stuck, and who or what got you unstuck?
   - Did anything from Monday's questions (alive, cost, why we build) change what you built or how you think about it?

**Bonus:** meet and work with at least one podmate outside class this week, in person or on a call. Say when, who, and what you did together.

---

## 7. Next week

**Monday, October 26:** a guest first, then work, then demos.

1. **Justin Shacklette, "My AI Life."**
2. **Pod work,** 30–40 minutes. Justin roams to help pods.
3. **Demos,** 3 minutes per pod.

After Oct 26 there's a short "taking stock" piece on where you want to go for your final project. It forms new final-project pods for the work classes on Nov 2, 9 and 16. Showcases are Monday Nov 30 and Friday Dec 4.

---

## 8. Sources

These are the sources behind the numbers and quotes above. Ask your AI to find and summarize any of them, then check it against the original.

**What is alive?** Nagel (1974) · Maturana and Varela, *Autopoiesis and Cognition* (1980) · Prigogine (Nobel Prize, 1977) · Capra and Luisi, *The Systems View of Life* (2014) · Block (1995) · Dehaene, Lau and Kouider, *Science* (2017) · Edelman, *PNAS* (2003) · Lindsey (Anthropic, 2025)

**What does it cost?** Google Cloud blog and arXiv 2508.15734 (Aug 2025) · Altman, "The Gentle Singularity" (Jun 2025) · de Vries, *Joule* (2023) · Epoch AI (Feb 2025) · IEA and Kamiya (2020) · MIT Technology Review (May 2025) · IEA, *Energy and AI* (Apr 2025) and *Key Questions on Energy and AI* (Apr 2026) · LBNL, *US Data Center Energy Usage Report* (Dec 2024) · Google Environmental Report 2026 · Couch (2026) via Simon Willison · Hausfather (2026) · Hugging Face AI Energy Score v2 (Dec 2025) · EIA · EPA · Colorado Sun and KUNC (Aug 2025) · TechCrunch (Apr 2025, Dec 2024) · Anthropic RSP v3 (Feb 2026) · The Register (Oct 2025) · IMF blog (Oct 2026) · International AI Safety Report 2026

**Why do we build?** darioamodei.com: "Machines of Loving Grace" (Oct 2024), "The Adolescence of Technology" (Jan 2026), "We Must Pace the Frontier" (Sep 2026) · Pope Leo XIV, *Magnifica Humanitas* (2026) · Crawford in *The Guardian* (2021) · a16z (2023) · Lewis, Arista, Pechawis and Kite, "Making Kin with the Machines," *Journal of Design and Science* (2018) · Bastani et al., *PNAS* (2025)
