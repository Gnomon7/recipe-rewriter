# My Recipe Book

**Live (read-only):** [gnomon7.github.io/recipe-scraper](https://gnomon7.github.io/recipe-scraper/)

A local recipe book: click a button in Chrome on any recipe page and it gets
cleaned up, saved, and rewritten so the instructions have ingredient
measurements inlined right where you need them — no more bouncing between
the ingredient list and the steps while you cook.

**Example** — a normal recipe step:

> whisk together the flour, granulated sugar, baking powder, and salt

becomes:

> whisk together the **2 cups** flour, **1/3 cup** granulated sugar, **1 Tbsp** baking powder, and **1/2 tsp** salt

It also has a one-click button to get the ingredient list into Google Keep
as a shopping list, a 1x/2x/3x/4x scale control, a US/Metric unit converter
(density-aware — a cup of flour and a cup of sugar don't weigh the same),
and automatic tags (category, cuisine, diet, main ingredients) you can
filter the book by.

Everything runs locally on your own machine — your recipes are stored as
plain JSON files on disk, not on any server.

## How it works

1. A small Chrome extension adds a toolbar button. Click it on any recipe
   page and it reads the page's [schema.org Recipe](https://schema.org/Recipe)
   data (the structured data almost every recipe site embeds for Google) to
   pull out just the title, image, ingredients, and instructions — no ads,
   no life story.
2. It sends that to a small local server (this repo), which rewrites the
   instructions to inline each ingredient's measurement the first time it's
   mentioned, and saves the recipe.
3. Open `http://localhost:5757` to browse your recipe book and cook from it.
4. On a recipe page, "Copy & Open Google Keep" copies a formatted shopping
   list to your clipboard and opens a fresh Keep note — just paste (⌘V).

## Setup

Requires [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
cp .env.example .env
```

Open `.env` and choose how instructions get rewritten:

- **`REWRITE_ENGINE=claude`** (default, most accurate) — also set
  `ANTHROPIC_API_KEY` to a key from [console.anthropic.com](https://console.anthropic.com/).
  Cost is a small fraction of a cent per recipe.
- **`REWRITE_ENGINE=local`** — free, fully offline, no API key. Uses
  regex-based ingredient matching instead of an LLM. Works well on simple
  recipes but is less accurate on unusual phrasing. You can switch between
  the two at any time by editing `.env` and restarting the server.

Start the server:

```bash
npm start
```

Leave this running in a terminal (or use `npm run dev` while developing,
which restarts automatically on file changes). Visit `http://localhost:5757`
to see your (empty) recipe book.

### Load the Chrome extension

See [extension/README.md](extension/README.md) for step-by-step instructions
(loading it unpacked, pinning it to the toolbar, and troubleshooting).

### Using it

Browse to any recipe page and click the Recipe Book icon in your toolbar.
You'll get a notification confirming it was saved (or explaining why not,
e.g. if the site doesn't publish structured recipe data). Open
`http://localhost:5757` to see it in your book.

## Project layout

```
server/     Express API + rewrite engines + JSON file storage
public/     The recipe book web UI
extension/  The Chrome extension (manifest V3)
```

Recipes are stored as individual JSON files under `server/data/recipes/`,
which is git-ignored — your personal recipe collection never gets committed
or shared when you push this code.

## Changing the port

The server defaults to port 5757. If that's taken on your machine, change
`PORT` in `.env`, **and** update both:

- `host_permissions` in `extension/manifest.json`
- `API_BASE` in `extension/background.js`

...to match, then reload the extension from `chrome://extensions`.

## Sharing this with friends

There are two ways to share, depending on what you want to share:

**The app itself** — this is a personal local tool, not a hosted service.
Each friend clones the repo and runs their own local copy (their own
`npm start`, their own recipe data, their own `.env`/API key if using the
Claude engine). Nothing about one person's setup is shared with another's.

**Your recipes** — to let people *browse* your saved recipes without
installing anything, publish a read-only static copy to GitHub Pages. This
repo already has Pages enabled (**Settings → Pages → Deploy from a branch
→ `main` / `docs`**), live at
[gnomon7.github.io/recipe-scraper](https://gnomon7.github.io/recipe-scraper/) —
updating it is just:

```bash
npm run publish
git add docs && git commit -m "Publish recipes" && git push
```

(A fresh clone/fork would need to redo that one-time Settings step before its
own `docs/` folder starts serving.)

The published site is read-only (no capture, no delete — those still need
your local server) but browsing, scaling, unit conversion, and Copy-to-Keep
all work, since they don't need a server. Re-run `npm run publish` and push
again any time you want the shared site to reflect newly-saved recipes.

**Important**: since this only works with a public repo, anything you
publish this way is visible to anyone with the link, not just people you
send it to — and stays recoverable in git history even after you remove it
from a later commit. Only publish recipes you're fine with being public.

## Notes on Google Keep

Google Keep doesn't offer a public API for personal Gmail accounts (only
Google Workspace), so the "export" button uses the clipboard + a fresh Keep
note tab rather than a fully automated integration. This deliberately avoids
storing your Google credentials anywhere or relying on unofficial,
Terms-of-Service-violating libraries.
