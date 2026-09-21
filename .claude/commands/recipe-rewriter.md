---
description: Start the local Recipe Book app and open it in your browser
---

Start the Recipe Book app from this repository's root.

1. Read `PORT` from `.env` (default to `5757` if `.env` doesn't exist yet). Check whether something is already listening on that port (e.g. `lsof -i :<port>`).
   - If the recipe-book server is already running there, skip to step 3.
   - If a *different*, unrelated process is already using that port, say so and stop rather than guessing — don't kill someone else's process.
2. Otherwise, start it fresh:
   - Run `npm install` if `node_modules/` doesn't exist yet.
   - Run `cp .env.example .env` if `.env` doesn't exist yet.
   - Start the server in the background with `npm start` and check its output to confirm it actually came up. Note which `REWRITE_ENGINE` is active. If it's `claude` but `ANTHROPIC_API_KEY` is empty, mention that recipes will still save fine, just without inlined measurements, until a key is added to `.env`.
3. Open `http://localhost:<port>` in the user's actual default browser with the macOS `open` command (not a sandboxed preview) — they'll want real clipboard/extension support for using the app for real.
4. Briefly confirm the server's status and remind the user: to add a recipe, click the "Recipe Book Capture" extension icon (loaded via `chrome://extensions` → Developer mode → Load unpacked → this repo's `extension/` folder) on any recipe page.

If `npm install` or `npm start` fail, show the actual error rather than guessing what's wrong.
