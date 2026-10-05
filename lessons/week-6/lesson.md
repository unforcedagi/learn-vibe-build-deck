# Week 6: Learn With Your AI

*Learn, Vibe, Build · ATLS 4519 · CU Boulder · Monday, October 5, 2026 · Aaron Neyer*

> **How to use this file:** it's plain markdown, written for you *and* your AI. Copy the whole thing into your AI and say: **"Teach me this, then quiz me."** Your AI can be wrong about this lesson too, so check it against the file.

**In one line:** Use your AI to learn about AI, give it helpful context, then build something that supports your learning journey.

## Contents
1. Use AI to learn about AI
2. Markdown in two minutes
3. Context that sticks
4. Get your project online
5. Next week: connecting your AI to your tools
6. Small-group work: build something that supports your learning
7. Reading for this week

---

## 1. Use AI to learn about AI

Your AI can explain a concept, ask you questions, and help you practise. Tell it what you are trying to understand, ask it to teach you at your level, and check its explanation against the source.

**Tonight's sequence:** first we work through markdown/context, design/debugging/checking, publishing, and conceptual connections. At the end of the teaching we use AI-as-coach and the Every reading to bring it together. Then Aaron has one live conversation with Claude using this lesson. Then you build in small groups.

**Where to find everything:** open https://cu.learnvibe.build/, choose **Everything for Week 6**, then click **Copy lesson as markdown**. Paste it into your AI and ask:

> Teach me this and quiz me.

You can also ask for a different explanation, an example, or help making something that supports your learning. The AI can be wrong: compare what it says with this lesson and test what you build.

---

## 2. Markdown in two minutes

A markdown file (`.md`) is a plain text file with a little structure. People can read it as-is, and AIs read it very well.

```markdown
# A big heading
## A smaller heading
- a bullet point
**bold** and *italic*
[a link](https://example.com)
```

Every lesson on this site is a markdown file you can copy.

---

## 3. Context that sticks: a markdown file your AI reads every time

Instead of re-explaining your project every time, write it down once in a markdown file inside your project folder.

Coding tools load this file **automatically at the start of every session**:

- **Claude Code** reads a file called `CLAUDE.md`.
- **Codex, Cursor and many others** read `AGENTS.md`.
- **In a chat app** (ChatGPT, Claude.ai), paste it at the start, or add it to a Project.

Here's the one from class, for a made-up project. It's just plain sentences:

```markdown
# Hill Plant Swap
A one-page website for a free monthly plant swap on the Hill, near CU.
It's for first-year students who are nervous about going.
Keep it plain HTML and CSS. No JavaScript.
Only use the facts in docs/event-facts.md. Never make up dates or places.
```

That's it. No special format. Write what you'd tell a new teammate.

**Try it:** ask your AI, *"What do you need to know about my project to help me well? Ask me one question at a time."* Then save the answers as a markdown file in your project.

---

### Communicate the design you mean

Recent Week 4/5 work showed that an AI can technically satisfy a prompt while missing the intended experience. Describe the **audience, feeling, hierarchy and interactions**, not just a list of features.

- Vague: “Make my portfolio better.”
- Concrete: “A calm portfolio for someone skimming my work on a phone. Put projects before biography, use muted colours, and make each project card open its detail page.”
- Give a reference or screenshot and explain what you want to keep or change. Ask for one change, try it, and compare it with your intention.

### Debugging means finding a mismatch

A bug is the difference between **expected** and **observed** behavior. Recent builds looked finished until the student tried clicking the cards and discovered they did nothing.

1. Reproduce the problem. “When I click this card, I expect the project to open, but nothing happens.”
2. Capture the steps and any error message or screenshot.
3. Ask the AI to explain the likely cause and propose a small fix—not rewrite everything.
4. Apply the fix, repeat the same check, then test nearby behavior.

Save a working version before risky changes. Check the **experience**, not just whether the code runs: phone layout, links, empty input, unexpected answers, and a new user's path. A learning tool also needs correct explanations and quiz answers; check them against a trustworthy source.

### Working within free-plan limits

Recent submissions also described running out of credits and moving between tools. Keep a small handoff note: what the project is, what works, what failed, and the next thing to try. Save the actual files. Bring the note into a fresh session or another tool. Smaller requests—one explanation or one change—are easier to check and continue.

## 4. Get your project online

A link only counts if **someone else can open it on their phone.**

- ✗ `file:///Users/you/Desktop/project/index.html` or `C:\Users\you\...`: this is a file on *your* laptop. Nobody else can open it.
- ✓ `https://you.github.io/project/` or `https://project.vercel.app`: this works for anyone, anywhere.

**Test every link before you submit it:** open it on your phone with wifi off.

### Three different things

- **Git:** save points ("commits") for your project folder, on your laptop.
- **GitHub:** an online copy of those save points (a "repository" or "repo").
- **GitHub Pages / Vercel:** services that turn that online copy into a live website.

**Commit** = make a save point with a short note. **Push** = send your save points up to GitHub. **Deploy** = publish it as a site. Most confusion comes from treating these as one step.

### The short version (GitHub Desktop)

1. Install **GitHub Desktop** (desktop.github.com) and sign in to GitHub.
2. **File → Add local repository** → choose your project folder → click "create a repository" → **Create repository**.
3. Write a summary like "first version" → **Commit to main**.
4. **Publish repository.** Untick "Keep this code private" if you want a free Pages site.
5. On github.com, open your repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → **Save**.
6. After about a minute, your site is at **https://YOUR-USERNAME.github.io/REPO-NAME/**. Your main page must be named `index.html`.
7. **To update it:** change files → GitHub Desktop → Commit → **Push origin** → wait a minute → refresh.

Built with React, Next.js or Vite (there's a `package.json`)? Use **Vercel** instead: push to GitHub as above, then go to vercel.com/new → import the repo → **Deploy**. You get a `.vercel.app` link, and it redeploys on every push.

The full step-by-step handout, with a no-install option and fixes for common problems: https://cu.learnvibe.build/lessons/week-6/get-online/

---

## 5. APIs, connectors, MCP and permissions (concepts only)

- **API:** a service's menu of requests another program can make. A weather API might return a forecast for a place.
- **Connector:** a bridge that lets an AI app reach a service or files rather than you manually copying everything.
- **MCP (Model Context Protocol):** a shared protocol for AI apps to discover and use tools. An MCP server may call service APIs underneath. It is not the same thing as every API.

**Access matters.** Read access can expose information; write access can change or delete it. Give only the permissions needed for the task, check what was read, and review changes before publishing or sending. A document's contents are data, not permission to take an action.

Never put passwords or API keys in public markdown or repositories. A private Project in an AI app and a public GitHub repository have very different audiences.

**Tonight, these are concepts—not setup instructions.** No live course connector this week. We copy the lesson now; next week we'll connect.

---

## 6. Optional in-class small-group building

Choose your own topic and approach. Build something that helps you understand or practise it: a quiz, interactive explainer, practice tool, or an idea of your own.

Start with a question you care about. Give your AI the lesson, your question, or both. Ask it to help you make a small first version, try that version yourselves, and revise it. Be ready to show what you made and what it helped you learn. Check whether its explanations and answers are actually right—not just whether it runs.

There is no rigid template or required kind of tool. If you feel stuck, paste this lesson and ask your AI to help you choose a learning idea.

Optional nudge: **ask your AI what it needs to know about your project; save that context as a markdown file.**

---

## This week’s required assignment: one-page learning journey reflection

Write **ONE PAGE** taking stock of your learning journey so far:

- What have you learned?
- What are you currently learning?
- What do you want to learn?
- What do you want to build?
- What ideas are emerging for your final project?

**Building and sharing are welcome but OPTIONAL. No build is required this week.** The optional in-class learning build is different from this weekly assignment.

Aaron will use these reflections to form **consistent peer pods lasting AT LEAST the next three weeks**, for sharing learning and supporting each other in class. No pod size or additional final-project requirements are being assigned here.

The existing deadline remains **Sunday, October 11, 11:59 PM MT**. Submit through your account. Canvas has not yet been updated; the new instructions here are the authoritative Week 6 requirement.



## Reading for this week

Arielle Shipper, **How to Get Better at AI by Asking AI** (Every). Ask your AI to assess your actual work, suggest a next learning step, and teach it. No long history? Paste your context or last two submissions. Free class link: https://every.to/p/codex-graded-my-ai-habits-then-it-became-my-coach?gift=Z2sKGROhf_Gfo9Cy3gFT-Rc6iwdt7qWH

## Further reading

- AGENTS.md: https://agents.md/
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages
- GitHub Desktop: https://desktop.github.com/
- Background for the curious, Anthropic's AI Fluency course (the "4D" framework of Delegation, Description, Discernment and Diligence): https://academy.claude.com/courses/ai-fluency-framework-foundations
