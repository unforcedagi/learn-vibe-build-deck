# Week 6: Context That Sticks, and Getting Online

*Learn, Vibe, Build · ATLS 4519 · CU Boulder · Monday, October 5, 2026 · Aaron Neyer*

> **How to use this file:** it's plain markdown, written for you *and* your AI. Copy the whole thing into your AI and say: **"Teach me this, then quiz me."** Your AI can be wrong about this lesson too, so check it against the file.

**In one line:** Your AI only knows what it can see. Give it your project's context in a markdown file so it sticks, and put your project online with a link anyone can open.

## Contents
1. Your AI starts every session from zero
2. Markdown in two minutes
3. Context that sticks: a markdown file your AI reads every time
4. Get your project online
5. Next week: connecting your AI to your tools
6. Reading for this week

---

## 1. Your AI starts every session from zero

An AI only sees what's in front of it right now: your message, the chat so far, and anything you paste or attach. It doesn't know your project unless you tell it.

So when you get a generic answer, it's usually a **context problem**, not a "bad AI" problem. The fix is to give it what it's missing.

The easiest way to try this tonight: **copy this lesson into your AI and ask it to teach you.** You just gave it context.

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

## 5. Next week: connecting your AI to your tools

Tonight you hand your AI context by pasting it or saving it in a file. Next week we go one step further.

- An **API** is how one program asks another for something, like a weather app asking a weather service for today's forecast.
- A **connector** lets your AI reach your tools and files directly, instead of you copying and pasting.

Next week we'll connect.

---

## 6. Reading for this week

**Arielle Shipper, "How to Get Better at AI by Asking AI"** (Every, October 2, 2026). Free link: on your account page at https://cu.learnvibe.build/account/ and in the course announcement on Canvas.

**Why this reading.** It's tonight's idea done for real: give your AI context about *you*, and it can coach you. Shipper asked her AI to place her on Every's "Eight Levels of AI Adoption" (a ladder from one-off chats up to running teams of agents) using their actual past work together, turned that into recommendations from projects she'd finished, and asked it to teach her the next step.

**Read it, then try one of these.** Copy this lesson (or the article) into your AI first.

1. **Place me on the ladder**
   > Read the article on the eight levels of AI adoption (paste it in if you can't open the link). Based on how I've worked with you so far, what level am I? Give specific examples from our work, and tell me what you're unsure about.

2. **Replay a finished project one level up**
   > Here's a project I've already finished: [describe it or paste your reflection]. How could it have run one level higher? What did I do by hand that I could have described or handed off, and what should I have kept doing myself?

3. **Teach me the next step**
   > Teach me the one habit that would move me up a level, using my own project as the example. One small step at a time; check that I've actually done each step before moving on.

**On a free plan, or no long chat history?** Your AI can't look back across sessions, so give it the evidence directly. Paste in your project's context file (from tonight) or your **last two weekly submissions**, then ask: *"Based on this, what level am I on the eight levels of AI adoption, with examples?"*

The AI's read on you is a draft, not a grade. Ask what it's basing it on, and push back where it's wrong.

---

## Further reading

- AGENTS.md: https://agents.md/
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages
- GitHub Desktop: https://desktop.github.com/
- Background for the curious, Anthropic's AI Fluency course (the "4D" framework of Delegation, Description, Discernment and Diligence): https://academy.claude.com/courses/ai-fluency-framework-foundations
