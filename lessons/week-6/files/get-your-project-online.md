# Get your project online

*Learn, Vibe, Build · Week 6 handout · copy this into your AI and ask it to walk you through it*

**Goal:** a link that **anyone** can open on **their phone**, like `https://yourname.github.io/my-project/`.

## First: is your link actually online?

| If your link starts with… | It is… |
|---|---|
| `file:///…` or `C:\Users\…` or `/Users/…` | **A file on your laptop.** Nobody else can open it. |
| `localhost:…` or `127.0.0.1:…` | **Running only on your laptop.** Nobody else can open it. |
| `https://…github.io/…` or `https://…vercel.app` or `https://…netlify.app` | **Online.** 🎉 |
| `https://github.com/you/project` | **Your code, not your site.** Fine to share as code, but it isn't the working app. |

**The test:** open the link on your phone with **wifi off**. If it works, it's online.

## Three words that cause most of the confusion

- **Git:** save points ("commits") for your project folder. It lives on your laptop.
- **GitHub:** a website that stores a copy of your project and its save points (a "repository" or "repo").
- **GitHub Pages / Vercel:** free services that turn a GitHub repo into a live website.

**Commit** = make a save point. **Push** = send your save points to GitHub. **Deploy** = publish it as a site.

---

## Path A: GitHub Desktop + GitHub Pages (recommended for HTML/CSS/JS sites)

Use this if your project is a folder with an `index.html` in it.

1. **Make a GitHub account** at github.com if you don't have one. Pick a short username; it becomes part of your link.
2. **Install GitHub Desktop** from desktop.github.com and sign in with your GitHub account.
3. **Check your folder.** The main page must be called exactly `index.html` and sit in the top level of the folder (not inside a subfolder).
4. In GitHub Desktop: **File → Add local repository…** → choose your project folder.
   - If it says "This directory does not appear to be a Git repository", click **create a repository** → **Create repository**.
5. Bottom left: type a summary like `first version` → **Commit to main**.
6. Top bar: **Publish repository**. **Untick "Keep this code private"** (free Pages sites need a public repo) → **Publish**.
7. Click **View on GitHub** (or open github.com/YOU/REPO).
8. On the repo page: **Settings** (top tab) → **Pages** (left sidebar).
9. Under **Build and deployment**: Source **Deploy from a branch** → Branch **main** → folder **/ (root)** → **Save**.
10. Wait about **one minute**, then refresh the Pages settings page. It shows **"Your site is live at https://YOU.github.io/REPO/"**. Click **Visit site**.
11. **Test it on your phone, wifi off.** Submit that link.

### Updating your site later
Change your files → GitHub Desktop shows the changes → write a summary → **Commit to main** → **Push origin** → wait a minute → refresh your site (on a phone, pull down to refresh).

## Path B: no installs (upload in the browser)

Good for a quick first try or a borrowed computer.

1. github.com → **+** (top right) → **New repository** → name it → **Public** → **Create repository**.
2. Click **uploading an existing file** → drag in the *contents* of your project folder (so `index.html` sits at the top) → **Commit changes**.
3. **Settings → Pages →** Deploy from a branch → **main** / **(root)** → **Save**. Wait a minute → **Visit site**.
4. To update: open the file on github.com → pencil icon to edit, or **Add file → Upload files** again.

## Path C: VS Code's built-in Git

If you already work in VS Code: open your folder → **Source Control** icon (left bar) → **Publish to GitHub** → choose **public** → it creates the repo and pushes for you. Then do steps 8–11 of Path A. To update later: Source Control → type a message → **Commit** → **Sync Changes**.

## Path D: React, Next.js, Vite, Svelte… (there's a `package.json`)

These need a build step, so use **Vercel**:

1. Get the code onto GitHub with Path A or C (skip the Pages settings).
2. Go to **vercel.com/new**, sign in with GitHub, and **Import** your repo.
3. Leave the settings it detects → **Deploy**. Wait a minute or two.
4. You get a link like `https://my-project.vercel.app`. Every push to GitHub redeploys it.

Built in a tool that hosts for you (Lovable, Bolt, Replit, v0)? Use its **Publish/Deploy/Share** button, and check that the link opens on your phone while you're logged out.

---

## When it doesn't work

| Problem | Fix |
|---|---|
| **404** at your github.io link | Wait 2 minutes. Check that the file is named exactly `index.html` (lowercase) and is at the top of the repo, not in a subfolder. Check Settings → Pages says it's live. |
| Page loads but **no styling or images** | Paths are wrong. Use relative paths like `style.css` or `images/cat.png`, not `/Users/you/...` or `C:\...`. File names are case-sensitive online: `Cat.PNG` ≠ `cat.png`. |
| **Pages option missing** or asks for an upgrade | The repo is private. Settings → General → bottom → Change visibility → Public. |
| **"Push rejected"** or "fetch first" | Someone (or you, on github.com) changed it online. In GitHub Desktop: **Fetch origin → Pull origin**, then push again. |
| Vercel **build failed** | Open the build log, copy the red error, and paste it to your AI with: "My Vercel deploy failed with this error. Explain it and give me the smallest fix." |
| It works for you but **not for others** | You're logged into something, or it's a `localhost` link. Test on your phone with wifi off. |

**Never commit secrets.** API keys and passwords don't go in your repo: anything in a public repo is public. Ask your AI how to use environment variables if your project needs a key.

## Ask your AI to walk you through it

> I'm on [Mac/Windows]. My project is [a folder of HTML files / a React app / built in Lovable / something else]. Walk me through getting it online with a link anyone can open, using the handout above. One step at a time; wait for me to say "done" before the next step. If I get an error I'll paste it.

*Official docs: GitHub Pages quickstart https://docs.github.com/en/pages/quickstart · GitHub Desktop https://docs.github.com/en/desktop · Vercel https://vercel.com/docs/getting-started-with-vercel*
