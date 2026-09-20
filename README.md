# My Recipe Book

A local recipe book: click a button in Chrome on any recipe page and it gets
cleaned up, saved, and rewritten so the instructions have ingredient
measurements inlined right where you need them — no more bouncing between
the ingredient list and the steps while you cook.

**Example** — a normal recipe step:

> whisk together the flour, granulated sugar, baking powder, and salt

becomes:

> whisk together the **2 cups** flour, **1/3 cup** granulated sugar, **1 Tbsp** baking powder, and **1/2 tsp** salt

It also has a one-click button to get the ingredient list into Google Keep
as a shopping list.

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

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this repo's `extension/` folder.
4. Pin the "Recipe Book Capture" icon to your toolbar (puzzle-piece icon → pin).

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

This is a personal local app, not a hosted service — each friend clones the
repo and runs their own local copy (their own `npm start`, their own recipe
data, their own `.env`/API key if using the Claude engine). Nothing about
one person's setup is shared with another's.

## Notes on Google Keep

Google Keep doesn't offer a public API for personal Gmail accounts (only
Google Workspace), so the "export" button uses the clipboard + a fresh Keep
note tab rather than a fully automated integration. This deliberately avoids
storing your Google credentials anywhere or relying on unofficial,
Terms-of-Service-violating libraries.
