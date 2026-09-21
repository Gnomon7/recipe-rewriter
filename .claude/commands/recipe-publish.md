---
description: Publish the current recipes to the read-only GitHub Pages site
---

Update the shared, read-only copy of the recipe book (`docs/`, served via GitHub Pages) to match what's currently saved in the live app.

1. From the repository root, run `npm run publish`. This regenerates `docs/` from `server/data/recipes/` — it's always a full re-export, safe to re-run any time.
2. Run `git status` / `git diff --stat -- docs` (or read `docs/data/recipes.json`) to see what actually changed: how many recipes now vs. before, which titles are new, and whether any were removed. Summarize this plainly to the user — this repo is public, so anything in `docs/` becomes visible to anyone with the link the moment it's pushed.
3. Ask the user to confirm before publishing (this is a real "publish externally visible content" action, not a formality) — show the summary from step 2 and wait for a clear yes. Don't assume yes just because they ran this command; they may want to check the diff first, especially if recipe titles/ingredients look sensitive.
4. Once confirmed: `git add docs`, commit (a short message naming what changed, e.g. "Publish N recipes" or listing new titles if there are only one or two), and push to the current branch's remote. If the current branch isn't `main`, mention that GitHub Pages serves from `main`/`docs` and ask whether to open a PR instead of pushing directly, following whatever branch/PR convention the rest of this repo's history uses.
5. Report the live URL (check the repo's `Settings → Pages` or the README's "Live" link near the top) once pushed.

If there's nothing new to publish (the diff is empty), say so and skip the commit — don't create an empty commit.
