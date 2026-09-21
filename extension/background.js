const API_BASE = 'http://localhost:5757';

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
  });
}

// Refreshes an already-open recipe book tab (in whichever window it's in)
// so it shows the just-saved recipe next time it's looked at -- without
// switching to it. Capturing is meant to work across many tabs in a row
// (open a recipe, confirm, move to the next), so jumping away after every
// single save would fight that workflow; if no recipe book tab is open,
// there's nothing to refresh and the desktop notification already covers
// the confirmation.
async function refreshRecipeBookTab() {
  const url = `${API_BASE}/`;
  try {
    const tabs = await chrome.tabs.query({ url: `${API_BASE}/*` });
    console.log('[recipe-book] recipe book tabs found:', tabs.length, tabs.map((t) => t.url));
    if (!tabs.length) return;
    const tab = tabs[0];
    if (tab.url === url) await chrome.tabs.reload(tab.id);
    else await chrome.tabs.update(tab.id, { url });
  } catch (err) {
    console.error('[recipe-book] could not refresh the recipe book tab:', err);
  }
}

chrome.action.onClicked.addListener((tab) => {
  console.log('[recipe-book] icon clicked, tab:', tab.id, tab.url);
  if (!tab.id) return;
  chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    .then(() => console.log('[recipe-book] content.js injected ok'))
    .catch((err) => {
      console.error('[recipe-book] executeScript failed:', err);
      notify('Could not save recipe', err.message || 'Could not access this page.');
    });
});

chrome.runtime.onMessage.addListener((message) => {
  console.log('[recipe-book] message received:', message);
  if (message?.type !== 'RECIPE_CAPTURED') return;
  handleCapturedRecipe(message.payload);
});

async function handleCapturedRecipe(payload) {
  console.log('[recipe-book] captured payload:', payload);
  if (!payload.ingredients?.length || !payload.instructions?.length) {
    console.warn('[recipe-book] no ingredients/instructions found, stopping');
    notify('No recipe found', "This page doesn't look like a supported recipe page yet.");
    return;
  }

  try {
    console.log('[recipe-book] posting to', `${API_BASE}/api/recipes/ingest`);
    const response = await fetch(`${API_BASE}/api/recipes/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Server responded with ${response.status}`);
    }

    const recipe = await response.json();
    console.log('[recipe-book] saved:', recipe.id);
    notify('Saved to Recipe Book', `"${recipe.title}" was added to your recipe book.`);
    refreshRecipeBookTab();
  } catch (err) {
    console.error('[recipe-book] save failed:', err);
    const isNetworkError = /fetch|NetworkError|Failed to fetch/i.test(err.message || '');
    notify(
      'Could not save recipe',
      isNetworkError ? 'Is the local server running? Try: npm start' : err.message
    );
  }
}
