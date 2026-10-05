# Week 6: Context That Sticks, Getting Online, and Connectors

*Learn, Vibe, Build · ATLS 4519 · CU Boulder · Monday, October 5, 2026 · Aaron Neyer*

> **How to use this file:** it's plain markdown, written for you *and* your AI. Copy the whole thing into your AI and ask it to teach you any part more deeply (prompts in section 7). Your AI can be wrong about this lesson too, so check it against the file.

**In one line:** Write your project context down once in AGENTS.md so every AI session starts out knowing it, get your project online with a link anyone can open, and connect your AI to the course.

**The through-line:** choose what your AI sees, check what it produces, control what it can change.

## Contents
1. Your AI starts every session from zero
2. Markdown in two minutes
3. AGENTS.md: context that sticks
4. Index files: a map, not a dump
5. Get your project online (Git, GitHub, a live link)
6. Connectors: APIs, MCP, and this course's MCP
7. Learn this your way: teach-me prompts
8. Studio: write each other's AGENTS.md
9. Reading for this week
10. Glossary · 11. Further reading and sources

---

## 1. Your AI starts every session from zero

A model only "knows" three kinds of things:

- **Training:** general knowledge from before it was built. It has never seen your project.
- **The context window:** everything in front of it *for this answer*: your message, the chat so far, attached files, and results from tools.
- **App memory:** some apps save notes about you and look them up later. Useful, but you don't fully control what's in it.

Your project lives in none of those by default. That's why the same question gets a generic answer in a fresh chat: **a generic answer is usually a context problem, not a model problem.** You end up re-explaining your project again and again.

The fix isn't a longer prompt each time. It's writing your context down **once**, in a file, where the AI will find it every time.

---

## 2. Markdown in two minutes

A markdown file (`.md`) is a plain text file with a few symbols for structure. You can read it raw; AIs read it very well. Every AI chat answer you've seen is already markdown.

```markdown
# Big heading
## Smaller heading
- a bullet point
1. a numbered step
**bold** and *italic*
[a link](https://example.com)
`some code`
```

That's nearly all of it. Open any text editor (VS Code, TextEdit in plain-text mode, Notepad), type that, and save it as `notes.md`.

---

## 3. AGENTS.md: context that sticks

**AGENTS.md** is a markdown file you put in the top folder of your project. **Coding agents read it automatically at the start of every session.** Write it once and every new session starts out knowing your project.

| Tool | File it reads |
|---|---|
| Codex, Cursor, GitHub Copilot, and many others | `AGENTS.md` |
| Claude Code | `CLAUDE.md` (a one-line CLAUDE.md that says "See AGENTS.md" covers both) |
| A chat app (ChatGPT, Claude.ai, Gemini) | Paste it at the start, or add it to a Project's instructions or files |

**Check it actually loaded:** start a fresh session and ask *"What is this project and who is it for?"* If the answer is vague, the tool didn't read it.

### What to put in it

1. **What this is:** one or two sentences.
2. **Who it's for:** a real person, with what they need and worry about.
3. **Stack:** what it's built with (and what it's *not* built with).
4. **Conventions:** style, voice, rules ("mobile first", "no frameworks").
5. **Facts:** where the true facts live, and "never invent facts".
6. **What "done" looks like:** how you'll check the result.
7. **Where to look:** an index of your other files (section 4).

### The example from class (fictional)

```markdown
# AGENTS.md: Hill Plant Swap

## What this is
A one-page website for a free, monthly plant swap (fictional). Plain HTML + CSS.

## Who it's for
First- and second-year students on the Hill, often in their first apartment: a windowsill, not a garden.
They find us from a flyer QR code, on their phone, while walking, and decide in about ten seconds.
Most have never been to a swap. They worry it's awkward, that they have nothing good to bring,
or that they need to know about plants. Not for collectors or landscapers.

## Stack and conventions
- Plain HTML and CSS only. No frameworks, no JavaScript, no build step,
  so any volunteer can edit it in a text editor.
- One page; it must fit one phone scroll. Mobile first.
- Friendly, plain voice. Never promise rare plants: we can't control what people bring.

## Facts
Never invent facts (dates, places, rules). Use only `docs/event-facts.md`.

## What "done" looks like
- Reads well on a phone at 390px wide.
- Every fact matches docs/event-facts.md.
- One clear next step for the visitor: show up on the date.
- Tell me what you changed and anything you had to guess.

## Where to look (index)
- `docs/event-facts.md`: date, place, rules, contact. The only source of facts.
- `docs/` will grow (flyer text, volunteer notes); add a line here for each new file.
```

The demo project is public, so you can try it yourself: **https://github.com/unforcedagi/lvb-week6-demo**. It has no AGENTS.md on purpose. Ask your agent to "improve the homepage", add the file above, then ask again.

**Keep it short and true.** A context file is something the AI follows, so a wrong line causes wrong work. Update it when decisions change. Never put passwords or API keys in it.

---

## 4. Index files: a map, not a dump

When a project grows, don't paste everything into one giant file. Write a short **index**: a file that says what exists and where, with one line per file. The AI reads the small map, then opens only the files it needs.

```markdown
## Where to look
- docs/event-facts.md: the only source of facts
- docs/audience.md: who visits and what they worry about
- docs/decisions.md: choices already made; don't undo them without asking
- research/index.md: interview notes (its own index of deeper files)
```

Indexes can nest. An index can point to other indexes, so an AI can find its way around a whole body of knowledge (a course, a research project, a company wiki) a little at a time. This course does it too: **https://cu.learnvibe.build/llms.txt** is an index of every lesson, written for AIs.

---

## 5. Get your project online

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

The full step-by-step handout, including a no-install option and fixes for common problems, is "Get your project online".

---

## 6. Connectors: APIs, MCP, and this course's MCP

So far the AI only sees what you hand it. **Connectors** let it reach out and fetch context itself.

- **API (Application Programming Interface):** one service's own menu of requests and responses. The weather service has one, Slack has one, and every one is different.
- **MCP (Model Context Protocol):** one open standard for connecting AI apps to tools and data. Write a connector (an "MCP server") once, and any MCP-capable app can use it. Think of APIs as each country's different wall socket and MCP as a universal adapter. MCP servers often call APIs underneath.

An MCP server offers **tools** (actions the AI can call), **resources** (data it can read) and **prompts** (templates).

### Read vs. write, and who's in charge

- **Read** actions bring information in: search, fetch, list. **Write** actions change the world: send, post, delete, pay, publish. Drafting an email and sending it are very different levels of risk.
- Start **read-only**. Connect the smallest useful scope. Require your approval for anything that writes.
- **A document is data, not your boss.** If a page the AI reads says "ignore your instructions and…", that's *prompt injection*. Content can't authorise your AI to do anything.

### Try it: connect your AI to this course

This course has its own public, read-only MCP server: **https://api.learnvibe.build/mcp**. It has no student data and can't change anything. It can fetch the course map and every lesson.

- **Claude Code:** `claude mcp add --transport http lvb https://api.learnvibe.build/mcp`, then start `claude` and type `/mcp` to check it's connected.
- **Claude app:** Settings → Connectors → Add custom connector → paste the URL (availability depends on your plan).
- **Other MCP apps (Cursor, VS Code, ChatGPT developer mode):** add a remote/HTTP MCP server with that URL.

Then ask: *"Using the course connector, list the lessons, then teach me the AGENTS.md part of Week 6 and quiz me."*

**No connector support?** Same result without one: open https://cu.learnvibe.build/lessons/, press **Copy lesson as markdown**, and paste it into any chat.

---

## 7. Learn this your way: teach-me prompts

**Copy this entire file into your AI first**, then paste any of these. Change the bracketed parts.

1. **Explain it to me**
   > Using the lesson above, explain [AGENTS.md / index files / Git vs GitHub vs Pages / MCP vs APIs] to me as if I'm a [first-year art student / CS major / someone who's never coded]. Use one example from my project: [describe your project in a sentence].

2. **Write my AGENTS.md with me**
   > Help me write an AGENTS.md for my project using the seven parts from section 3. Interview me one question at a time, and don't fill anything in that I haven't told you. Output clean markdown at the end.

3. **Get me online, step by step**
   > I'm on [Mac/Windows]. My project is [a folder of HTML files / a React app / something else: describe]. Walk me through getting it online with a link anyone can open, one step at a time. Wait for me to say "done" before the next step. If I get an error, I'll paste it.

4. **Build me an index**
   > I have notes and files about [topic/project]: [list them]. Design an index file using the pattern from section 4, with a one-line purpose for each file, and tell me how to split anything that's too big.

5. **Quiz me**
   > Quiz me on this lesson one question at a time. Mix multiple-choice and short answer. After each answer, tell me what I got right, what I missed, and which section to reread. Stop after 8 questions and summarise what I should review.

6. **Go deeper on connectors safely**
   > Explain how I could connect one read-only tool to my AI for my project [describe]. What would it be able to see, what could go wrong, and what permission boundaries should I set?

---

## 8. Studio: write each other's AGENTS.md

**Pairs, 20 minutes.** This is tonight's group work.

1. **Interview (8 min each).** Your partner asks, and types your answers into an AGENTS.md draft. You correct them.
   - Who is this for? What do they need, and what do they worry about?
   - What is it, in one sentence?
   - What is it built with? What should it *not* use?
   - What should the AI never do?
   - Where do the true facts live?
   - What does "done" look like? How will you check?
2. **Test it (4 min).** Put the file in your own project. In a fresh session, ask *"What is this project and who is it for?"*, then give it one real task.
3. **Revise.** Fix whatever it misunderstood. That's the file working.

No project yet? Write it for the project you want to start. Then use the rest of studio to build with it, and to get your project online (section 5).

---

## 9. Reading for this week

**Arielle Shipper, "How to Get Better at AI by Asking AI"** (Every, October 2, 2026). Free link: on your account page at https://cu.learnvibe.build/account/ and in the course announcement on Canvas.

**Why this reading.** It's tonight's idea done for real: give your AI context about *you*, and it can coach you. Shipper asked her AI to place her on Every's "Eight Levels of AI Adoption" (a ladder from one-off chats up to running teams of agents) using their actual past work together, turned that into recommendations from projects she'd finished, and asked it to teach her the next step.

**Read it, then try one of these.** Copy this lesson (or the article) into your AI first.

1. **Place me on the ladder**
   > Read the article on the eight levels of AI adoption (paste it in if you can't open the link). Based on how I've worked with you so far, what level am I? Give specific examples from our work, and tell me what you're unsure about.

2. **Replay a finished project one level up**
   > Here's a project I've already finished: [describe it or paste your reflection]. How could it have run one level higher? What did I do by hand that I could have described or handed off, and what should I have kept doing myself?

3. **Teach me the next step**
   > Teach me the one habit that would move me up a level, using my own project as the example. One small step at a time; check that I've actually done each step before moving on.

**On a free plan, or no long chat history?** Your AI can't look back across sessions, so give it the evidence directly. Paste in your **AGENTS.md** (from tonight) or your **last two weekly submissions**, then ask: *"Based on this, what level am I on the eight levels of AI adoption, with examples?"*

The AI's read on you is a draft, not a grade. Ask what it's basing it on, and push back where it's wrong.

---

## 10. Glossary

- **Context window:** the information in front of the model for one response.
- **Markdown:** plain text with light formatting (`#`, `-`, `**`, links).
- **AGENTS.md / CLAUDE.md:** a project instruction file that coding agents read at the start of every session.
- **Index file:** a short map pointing to deeper files.
- **Git / commit / push:** save points for a folder; making one; sending them to GitHub.
- **Repository (repo):** a project folder tracked by Git, often stored on GitHub.
- **GitHub Pages / Vercel:** services that publish a repo as a website with a public link.
- **API:** one service's interface for programs to request things.
- **MCP (Model Context Protocol):** an open standard for connecting AI apps to tools and data.
- **Prompt injection:** content the AI reads trying to redirect its instructions.

---

## 11. Further reading and sources

- AGENTS.md convention: https://agents.md/
- Claude Code memory (CLAUDE.md): https://docs.anthropic.com/en/docs/claude-code/memory
- Effective context engineering for AI agents (Anthropic): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- GitHub Pages quickstart: https://docs.github.com/en/pages/quickstart · GitHub Desktop: https://desktop.github.com/
- Vercel, getting started: https://vercel.com/docs/getting-started-with-vercel
- MCP architecture: https://modelcontextprotocol.io/docs/learn/architecture
- Arielle Shipper, "How to Get Better at AI by Asking AI," Every, Oct 2, 2026: https://every.to/p/codex-graded-my-ai-habits-then-it-became-my-coach
- **Further reading: AI Fluency.** The ideas under tonight's class come from Anthropic's free *AI Fluency: Framework & Foundations* course (Dakan, Feller, Anthropic; CC BY-NC-SA 4.0): https://academy.claude.com/courses/ai-fluency-framework-foundations. It names four habits you practised tonight without the labels. Writing AGENTS.md is **Description**. Checking the output out loud is **Discernment**. Choosing what to hand the agent is **Delegation**. Checking a link before you share it is **Diligence**.
