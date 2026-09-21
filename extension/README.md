# Loading the Recipe Book Capture extension

Chrome extensions in development aren't installed from the Chrome Web
Store — you load the folder directly. There are no screenshots here: Chrome
blocks all extensions (including automation ones) from navigating to or
capturing its own internal `chrome://` pages, so these are the exact labels
and layout to look for instead.

## Steps

1. **Open the extensions page.** Type `chrome://extensions` directly into
   Chrome's address bar and press Enter (Chrome won't let you get there by
   clicking a link, as a security measure).
2. **Turn on Developer mode.** It's a toggle switch in the top-right corner
   of the page. Once it's on, three new buttons appear near the top-left:
   "Load unpacked," "Pack extension," and "Update."
3. **Click "Load unpacked."** This opens your normal OS file picker.
4. **Select this repo's `extension/` folder** (this one — the folder this
   README is in, not a file inside it) and confirm. A new card appears in
   the extensions list titled **"Recipe Book Capture"**, version 1.0.0, with
   a small terracotta plate icon.
5. **Pin it to the toolbar.** Click the puzzle-piece "Extensions" icon in
   Chrome's toolbar (top-right, next to the address bar). Find "Recipe Book
   Capture" in the dropdown and click the pin icon next to it. The plate
   icon now stays visible in the toolbar.

You're set — browse to any recipe page and click that icon.

## Troubleshooting

- **Nothing happens when you click the icon.** Make sure the local server
  is running (`npm start` in the repo root). See the main
  [README](../README.md#using-it) for the full capture flow and debugging
  notes.
- **Changed `manifest.json`, `background.js`, or `content.js`?** Click the
  circular reload icon on the extension's card in `chrome://extensions` —
  Chrome doesn't pick up file changes automatically.
- **Want to see what the extension is doing?** Click "service worker" under
  "Inspect views" on the extension's card to open its DevTools console —
  it logs each step (click → inject → extract → send → save). For what the
  page-extraction step sees, open DevTools on the recipe page itself
  (right-click → Inspect → Console), since that code runs there, not in the
  extension's own background context.
- **Changed the server's port** in `.env`? You'll also need to update
  `host_permissions` in `manifest.json` and `API_BASE` in `background.js`
  to match, then reload the extension.
