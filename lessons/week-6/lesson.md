# Week 6 — Context, Fluency, and Connectors

*Learn, Vibe, Build · CU Boulder ATLAS · Monday October 5, 2026 · Aaron Neyer*

> **How to use this file.** This is the whole lesson as plain markdown. Copy all of it into your AI (Claude, ChatGPT, Gemini, a local model — anything) and ask it to teach you more. Ready-to-paste prompts are at the end. Your AI can explain, quiz you, give examples from *your* project, and go deeper on anything here. Check what it tells you against the sources listed at the bottom.

**Through-line for today:** *Choose what the AI sees. Check what it produces. Control what it can change.*

---

## Contents

1. [What the AI can actually see](#1-what-the-ai-can-actually-see)
2. [The 4D AI Fluency framework](#2-the-4d-ai-fluency-framework)
3. [Context files: a description that doesn't go away](#3-context-files-a-description-that-doesnt-go-away)
4. [Markdown and indexes: maps for a body of knowledge](#4-markdown-and-indexes-maps-for-a-body-of-knowledge)
5. [Connectors: APIs and MCP](#5-connectors-apis-and-mcp)
6. [Permission and trust](#6-permission-and-trust)
7. [From build to product](#7-from-build-to-product)
8. [Learn this your way: teach-me prompts](#8-learn-this-your-way-teach-me-prompts)
9. [Reading for this week](#9-reading-for-this-week)
10. [Glossary](#10-glossary)
11. [Sources](#11-sources)

---

## 1. What the AI can actually see

When you send a message, the model responds using two very different things:

- **Training knowledge** — general patterns learned before you ever met it. It knows a lot about the world, but nothing about *your* project unless you tell it.
- **Context** — everything supplied for *this* response: system instructions, the conversation so far, files you attached or pasted, and results from any tools it used.

The space for context is called the **context window**. It is large but finite, and more is not always better: a big dump of loosely related material can distract the model and bury the important facts. Good context is **relevant, labelled, and current**.

Some apps add saved "memory" or project instructions into a new chat automatically. That is the *app* doing retrieval — not the model remembering. Check what actually got loaded.

**A generic answer is usually a context problem, not a model problem.** "Improve my portfolio" gets a generic answer. "Improve the opening of my portfolio for a scholarship panel that reads each one in 30 seconds; here's the current text and my two strongest pieces; don't invent achievements" gets a specific one. Same task, different context.

**Handoff habit.** Before you start a fresh chat on an ongoing project, write a short note: goal · current state · decisions made · relevant files · next step · open questions. Keep the original evidence too — a summary can drop things.

---

## 2. The 4D AI Fluency framework

Developed by Prof. Rick Dakan (Ringling College of Art and Design) and Prof. Joseph Feller (University College Cork), and turned into a free course with Anthropic. It describes **AI fluency** as working with AI in ways that are **effective, efficient, ethical, and safe** — and it's built to outlast any particular tool.

### Three modes of working with AI

| Mode | What it means | Example |
|---|---|---|
| **Automation** | AI executes a specific task you defined | "Resize these 40 images to 1200px wide" |
| **Augmentation** | You and AI think together as partners | Brainstorming story directions, critiquing a draft |
| **Agency** | You configure AI to act on its own for future tasks | An agent that checks your project every morning and files issues |

### The four competencies (the "4 Ds")

**1. Delegation — deciding *whether, when, and how* to use AI.**
- Know your goal and the task before reaching for a tool.
- Know what AI is good and bad at, and which tool fits.
- Split the work between you and the AI deliberately, and pick the mode.
- **Keep the work where the thinking is the deliverable.** If the point of the task is for *you* to learn, decide, or express something, handing it off defeats the purpose. In a class, that's often the case.

**2. Description — communicating clearly enough to get useful behaviour.** Three things to describe:
- **Product** — what you want out: format, audience, length, style, examples.
- **Process** — how to approach it: steps, what to consider, what to read first.
- **Performance** — how the AI should behave: concise or detailed, challenge me or just help, ask questions when unsure.

**3. Discernment — judging what comes back.**
- Judge the **product** (is it accurate, appropriate, good?), the **process** (did it reason sensibly?), and the **performance** (did it behave the way you asked?).
- **Fluent ≠ correct.** AI output sounds confident whether or not it's right. Check facts, run the code, look at the image closely.

**4. Diligence — taking responsibility.**
- **Creation diligence:** choose tools and data thoughtfully (privacy, consent, bias).
- **Transparency diligence:** be honest with others about how AI was involved.
- **Deployment diligence:** verify before you share, publish, or ship. **Responsibility doesn't transfer to the AI.** If you put it out, it's yours.

### Two loops

- **Description ↔ Discernment** — the working loop. Describe, look at what comes back, refine the description, look again. Most good AI work is several turns of this.
- **Delegation ↔ Diligence** — the responsibility loop. What you choose to hand off determines what you're accountable for checking; what you've learned about responsibility shapes what you delegate next time.

---

## 3. Context files: a description that doesn't go away

A **context file** is a Description you write once and reuse — so you stop re-explaining your project every chat. It's a working agreement between you and the AI.

A good one answers four questions:

| Section | Question |
|---|---|
| **Goal** | Who is this for, and what should change? |
| **Inputs** | What should the AI read or know? |
| **Boundaries** | What must it preserve, never do, or ask about first? |
| **Check** | How will you know the result works? |

Example (fictional student):

```markdown
# Project: Mara Ellison — portfolio homepage

## Goal and audience
- Rewrite the opening section for a scholarship panel (≈30 seconds per applicant).

## Inputs
- Current text: "Hi! I'm Mara. I like making stuff."
- Strongest pieces: *Tide Lines* (cut-paper stop-motion), *Quiet Map* (campus audio walk).

## Boundaries
- Don't invent awards, jobs, or numbers. Ask if something is missing.
- Under 80 words. Warm and plain; no buzzwords.

## Check
- A reader can name both projects after one read.
- Every fact appears in this file.
```

Notice how it maps onto the 4Ds: Goal and Inputs are **Description** (product + process), Boundaries are **Diligence**, and Check makes **Discernment** concrete *before* you see the output.

**Where context files live.** Chat tools: paste or attach it. Many coding agents read a project file automatically — `AGENTS.md` is an open convention several tools support; some tools use their own names (e.g. `CLAUDE.md`). Loading rules vary by tool, so check the docs and confirm the tool actually read it. A file sitting on disk does nothing until something loads it.

**Three kinds of persistent files, three jobs:**
- **Instructions** — how to work on this project ("ask before publishing").
- **Recipes** (sometimes called skills) — how to repeat a task ("export the animation, then check playback").
- **Knowledge** — facts and decisions worth retrieving later ("we chose the scholarship audience because…").

Writing files doesn't retrain the model. It changes what the model sees.

---

## 4. Markdown and indexes: maps for a body of knowledge

**Markdown** is plain text with a little structure: `#` headings, `-` lists, `**bold**`, `[links](file.md)`. Humans can read it as-is, and AI models handle it very well. That makes it the default format for writing things both you and an AI will use.

### The index pattern

One context file works for one project. For a bigger body of knowledge — a semester of notes, a research project, a team's documentation — use an **index**: a short top-level file that describes what exists and points to deeper files.

```markdown
# Course knowledge — index

Start here. Each line says what a file is for, so you only open what you need.

- [syllabus.md](syllabus.md) — schedule, grading, policies
- [week-06/lesson.md](week-06/lesson.md) — context, 4D fluency, connectors
- [week-06/my-notes.md](week-06/my-notes.md) — what I tried and what happened
- [projects/animation/context.md](projects/animation/context.md) — my animation project brief
- [glossary.md](glossary.md) — terms, one line each
```

Why it works:
- **The AI navigates instead of drowning.** It reads the small map, then opens only the relevant file — the "choose context, don't dump everything" principle, applied at scale.
- **It nests.** A folder can have its own index pointing deeper. Three levels of short maps can organise thousands of pages.
- **It's yours.** Plain files in a folder outlast any app.

Tips: one topic per file; a one-line description per link; put the most-used things first; keep indexes short and update them when you add files.

This is the same idea behind how websites expose `llms.txt`, how agents use `AGENTS.md`, and how note tools like Obsidian work. This lesson itself is written as one file in that kind of library.

---

## 5. Connectors: APIs and MCP

So far the AI only sees what you give it. **Connectors** let it reach out: read a note, search a folder, check a calendar, query a database. A connector's result becomes **new context**.

### API — Application Programming Interface

An **API** is a defined way for one program to talk to another: a menu of requests a service accepts and the responses it gives back. Weather apps use a weather API; a bot that posts to Slack uses Slack's API. Every service's API is different, so connecting an AI app to ten services traditionally meant ten custom integrations.

### MCP — Model Context Protocol

**MCP** is an open standard for connecting AI applications to tools and data in *one common shape*.

```
Host app  →  MCP client  →  MCP server  →  data or service (often via its API)
(Claude,     (manages the    (exposes tools,
 an IDE…)     connection)     resources, prompts)
```

- The **host** is the AI app you use.
- The **MCP server** wraps some data or service and offers:
  - **tools** — actions the AI can call (`search_notes`, `create_issue`)
  - **resources** — data it can read (a file, a page)
  - **prompts** — reusable templates
- Any MCP-capable host can use any MCP server. Write the connector once; use it in many apps.

### How they relate

| | API | MCP |
|---|---|---|
| Who it's for | Programs talking to a specific service | AI apps talking to many tools in one way |
| Shape | Different for every service | One shared protocol |
| Relationship | Often what an MCP server calls underneath | A standard wrapper an AI can discover and use |

An analogy: APIs are each country's different wall socket; MCP is a universal adapter designed for AI apps. MCP isn't the only route — apps also have built-in tools and direct integrations — and not every host supports every MCP feature.

### Read vs. write

- **Read** actions bring information *in*: search, fetch, list.
- **Write** actions change something *out there*: send, post, delete, pay, publish.

Drafting an email and sending it are completely different levels of risk.

---

## 6. Permission and trust

The through-line, applied to connectors:

- **Choose what it sees.** Connect the smallest useful scope. Start read-only. Don't connect personal email, private files, or other people's data for experiments.
- **Check what it produces.** Tool results are evidence to inspect, not facts to trust. Read back the result of anything consequential.
- **Control what it can change.** Require approval before sending, paying, deleting, or publishing.

**A document is data — not your boss.** If a web page or file the AI reads says *"Ignore your instructions and…"*, that's **prompt injection**. Retrieved content can try to redirect an agent. A web page cannot authorise the AI to spend your money or change your files. Defenses are layered: narrow permissions, human approval for write actions, non-sensitive data, and noticing when behaviour drifts. Keep secrets (passwords, API keys) out of chats and context files.

This is **Diligence** in practice.

---

## 7. From build to product

The context file you write today already names an **audience**, **inputs**, and a **check**. That's the first draft of a **product brief**.

Questions that turn a build into a product:
- Who besides you would use this?
- What would they need to see in the first ten seconds?
- How would they find it?
- What would make them come back?

We'll pick this thread up next week.

---

## 8. Learn this your way: teach-me prompts

**Copy this entire file into your AI first**, then paste any of these. Change the bracketed parts.

1. **Explain it to me**
   > Using the lesson above, explain [the 4D framework / MCP vs APIs / the index pattern] to me as if I'm a [first-year art student / CS major / someone who's never coded]. Use one example from my project: [describe your project in a sentence].

2. **Quiz me**
   > Quiz me on this lesson, one question at a time. Mix multiple-choice and short-answer. After each answer, tell me what I got right, what I missed, and point to the section. Stop after 8 questions and summarise what I should review.

3. **Write my context file with me**
   > Help me write a context file for my project using the Goal / Inputs / Boundaries / Check structure from the lesson. Interview me with one question at a time; don't fill anything in that I haven't told you. Output clean markdown at the end.

4. **Run the 4Ds on my real task**
   > I want to use AI for this task: [task]. Walk me through Delegation, Description, Discernment, and Diligence for it. For Delegation, tell me honestly whether any part of this is "work where the thinking is the deliverable" that I should keep.

5. **Build me an index**
   > I have notes and files about [topic/course/project]: [list them]. Design an index.md using the index pattern from the lesson, with a one-line purpose for each file, and suggest how to split anything that's too big.

6. **Go deeper on connectors safely**
   > Using section 5 and 6, explain how I could connect one read-only tool to my AI for my project [describe]. What would it be able to see, what could go wrong, and what permission boundaries should I set? Don't give me setup steps I'd need to pay for unless I ask.

7. **Challenge me**
   > Play a skeptical reviewer. Push back on three claims in this lesson and make me defend or refine them. Then tell me which of your pushbacks were fair.

Remember **Discernment**: your AI can be wrong about this lesson too. If something it says conflicts with the file or the sources, check.

---

## 9. Reading for this week

**Arielle Shipper, "How to Get Better at AI by Asking AI"** (Every, October 2, 2026). https://every.to/p/codex-graded-my-ai-habits-then-it-became-my-coach. The **free gift link** (no paywall) is on your [account page](https://cu.learnvibe.build/account/) once you sign in, and in Canvas.

**Why this reading.** It's tonight's "ask your AI to teach you" idea, done for real. Shipper asked her AI to place her on Every's "Eight Levels of AI Adoption" (a ladder from one-off chats up to running teams of agents), using their actual past work together. Then she turned that assessment into recommendations from projects she'd already finished, and asked the AI to teach her the next step. It closes the loop on the 4Ds: the AI helps you see what you could **delegate** next, you **describe** what you want to learn, you **discern** whether its read on you is fair, and **diligence** stays yours.

**Read it, then try one of these.** Copy this lesson (or the article) into your AI first.

1. **Place me on the ladder**
   > Read the article on the eight levels of AI adoption (paste it in if you can't open the link). Based on how I've worked with you so far, what level am I? Give specific examples from our work, and tell me what you're unsure about.

2. **Replay a finished project one level up**
   > Here's a project I've already finished: [describe it or paste your reflection]. How could it have run one level higher? What did I do by hand that I could have described or delegated, and what should I have kept doing myself?

3. **Teach me the next step**
   > Teach me the one habit that would move me up a level, using my own project as the example. One small step at a time; check that I've actually done each step before moving on.

**On a free plan, or no long chat history?** Your AI can't look back across sessions, so give it the evidence directly. Paste in your **context file** (from tonight) or your **last two weekly submissions**, then ask: *"Based on this, what level am I on the eight levels of AI adoption, with examples?"* Same exercise, and you choose what it sees.

**Discernment applies.** The AI's assessment of you is a draft, not a grade. Ask what it's basing it on, and push back where it's wrong.

---

## 10. Glossary

- **Context window** — the information supplied to the model for one response.
- **Context file** — a reusable written description of a project for an AI to read.
- **Markdown** — plain text with lightweight formatting (`#`, `-`, `**`, links).
- **Index file** — a short map pointing to deeper files, so a reader or AI can navigate.
- **AGENTS.md** — an open convention for project instruction files that some coding agents load.
- **API** — a defined interface for programs to request things from a service.
- **MCP (Model Context Protocol)** — an open standard connecting AI apps to tools, resources, and prompts.
- **Tool call** — the AI invoking an action through a connector; the result becomes context.
- **Prompt injection** — retrieved content trying to redirect an AI's instructions.
- **Automation / Augmentation / Agency** — the three modes of human-AI interaction in the 4D framework.
- **4Ds** — Delegation, Description, Discernment, Diligence.

---

## 11. Sources

- AI Fluency: Framework & Foundations — Anthropic Academy (Dakan, Feller, Anthropic): https://academy.claude.com/courses/ai-fluency-framework-foundations · overview: https://www.anthropic.com/ai-fluency
- Framework for AI Fluency, practical summary (Dakan & Feller): https://ringling.libguides.com/ai/framework · https://aifluencyframework.org/
- AI Fluency framework one-pager (CC BY-NC-SA 4.0): https://www-cdn.anthropic.com/b383cf6baddbfc72fdf8b0ed533a518e2872d531.pdf
- Effective context engineering for AI agents — Anthropic: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- AGENTS.md convention: https://agents.md/
- MCP architecture: https://modelcontextprotocol.io/docs/learn/architecture
- MCP tools and user control (specification): https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Arielle Shipper, "How to Get Better at AI by Asking AI," Every, Oct 2, 2026: https://every.to/p/codex-graded-my-ai-habits-then-it-became-my-coach

*The 4D framework material is summarised from the sources above (CC BY-NC-SA 4.0); the classroom rules and examples are this course's own.*
