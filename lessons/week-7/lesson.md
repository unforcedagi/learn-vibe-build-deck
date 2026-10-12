# Week 7: How Things Talk

*Learn, Vibe, Build · ATLS 4519 · CU Boulder · Monday, October 12, 2026 · Aaron Neyer*

> **How to use this file:** it's plain markdown, written for you *and* your AI. Copy the whole thing into your AI and say: **"Teach me this, then quiz me."** Your AI can be wrong about this lesson too, so check it against the file.

**In one line:** Learn how programs talk to each other (networks, APIs, OAuth and MCP), so your builds can reach real data and your AI can use real tools.

## Contents
1. Arrive: notice what is already here
2. How the internet talks
3. APIs: a menu another program offers
4. OAuth: a permission slip, not your password
5. MCP: a standard plug so your AI can use tools
6. Which API would make your project real?
7. Design, from a classmate
8. Pods
9. This week's work

---

## 1. Arrive: notice what is already here

Before any screens: sit for a minute and notice what is around you. Sounds in the room, the light, your breath without changing it. The mind is already open; there is nothing to add.

Why this belongs in an AI class:

- **Clear mind, clear ask.** The quality of your thinking becomes the quality of your prompt. When you can say plainly what you want, the AI can build it.
- **Balance.** These tools can quietly take your whole attention. A simple practice, even one minute of noticing, is how you come back to yourself.

---

## 2. How the internet talks

The internet is programs asking each other for things.

**Your app (the client)** → sends a **request** → to a **server** → which sends back a **response**.

- **URL**: the address of the thing you're asking for.
- **HTTP**: the conversation (the rules for asking and answering).
- **JSON**: the format data usually comes back in. It looks like `{"temperature": 72}`.

Every page you load makes dozens of these requests. To see them: open your browser's developer tools, go to the **Network** tab, and reload the page.

**Why your link doesn't work for anyone else:** `localhost` and `file:///` links point at *your* computer. Only you can reach them. To share a build, put it online (GitHub Pages, Vercel, Netlify). See the Week 6 handout: https://cu.learnvibe.build/lessons/week-6/get-online/

---

## 3. APIs: a menu another program offers

An **API** (application programming interface) is a menu another program offers. Your code orders from it.

- **Endpoint**: the address of one thing on the menu, e.g. "current weather for these coordinates".
- **Method**: `GET` to read something, `POST` to send or create something.
- **Key**: a secret that proves who is asking. Usage (and sometimes cost) is counted against it.
- **Limits**: how often you can ask, and what it costs.

**Try one now, no key needed:** live Boulder weather from Open-Meteo:
https://api.open-meteo.com/v1/forecast?latitude=40.01&longitude=-105.27&current=temperature_2m&temperature_unit=fahrenheit

Then ask your AI: *"Add the current Boulder temperature to this page using the Open-Meteo API."*

**The key rule:** API keys never go in front-end code or a public GitHub repo. Anyone can read them there and spend your credits. Keep keys on a server, in an environment file (`.env`) that is not committed, or in your hosting platform's secret settings. If you've already pushed a key, delete it on the provider's site and make a new one.

---

## 4. OAuth: a permission slip, not your password

When you click **"Sign in with Google"** or **"Connect your Spotify"**, that's usually OAuth.

- The app never sees your password. It gets a **token**: a permission slip.
- **Scopes** say exactly what that slip allows: "read your calendar", not "send email as you".
- This is how apps reach *your* stuff: listening history, fitness or sleep data, calendars, files.
- You can revoke the slip any time in your account settings.

If your project needs a user's own data from another service, look for "OAuth" in that service's developer docs, and ask your AI to walk you through the setup step by step.

---

## 5. MCP: a standard plug so your AI can use tools

**MCP** (Model Context Protocol) is a standard way for an AI to use tools and data.

**Your AI** → MCP → **a tool or server** → API → **the world**

- An **API** lets your *app* talk to a service. **MCP** lets your *AI* talk to a service.
- It's one standard, so any tool that speaks MCP works with any AI that speaks it.
- Where you'll find it: Claude connectors, Claude Code, Codex (now included with ChatGPT Edu), Antigravity, Cursor.
- It's the clean way to get your AI and your tools working together, instead of copy-pasting between chats.
- **Watch your usage.** Tools that run on their own can burn through limits fast. Start small and check.

---

## 6. Which API would make your project real?

Some places to start:

- Maps, travel time, opening hours
- Weather
- Music (Spotify, Last.fm)
- Health and fitness (Oura, Fitbit)
- Calendars
- Market data
- An AI model itself, called from your app (Claude, OpenAI, Gemini)

Ask your AI: *"Here's my project. Which free or cheap APIs could make it more real, and what would I need (keys, OAuth, limits) for each?"*

---

## 7. Design, from a classmate

A 10–15 minute lesson on design from a classmate.

---

## 8. Pods

For the next three weeks you'll work in a small peer pod. The second half of class is pod time: work together, share directly, help each other move things forward. Aaron will rotate through the pods.

**First pod session:** start with a round. Each person shares:

1. Where you are.
2. Where you're stuck.
3. What you want to learn or build.

Then work together. At the end of class, each pod gives a short shareback (no full demos).

In the final three weeks of the semester, pods will be re-formed around final projects.

---

## 9. This week's work

**Due Sunday, October 18, 11:59 PM.** Same 10 points as usual. Submit through your account or on Canvas; either counts.

Build something in a direction that supports your learning. A good default: **connect one real API or MCP** to something you're building, or play with one in a direction you care about.

Then reflect, in your own words:

- What it unlocked.
- Where you got stuck.
- What your pod helped with (or what you helped someone else with).
