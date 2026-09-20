const API_BASE = 'http://localhost:5757';

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
  });
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    .catch((err) => notify('Could not save recipe', err.message || 'Could not access this page.'));
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'RECIPE_CAPTURED') return;
  handleCapturedRecipe(message.payload);
});

async function handleCapturedRecipe(payload) {
  if (!payload.ingredients?.length || !payload.instructions?.length) {
    notify('No recipe found', "This page doesn't look like a supported recipe page yet.");
    return;
  }

  try {
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
    notify('Saved to Recipe Book', `"${recipe.title}" was added to your recipe book.`);
  } catch (err) {
    const isNetworkError = /fetch|NetworkError|Failed to fetch/i.test(err.message || '');
    notify(
      'Could not save recipe',
      isNetworkError ? 'Is the local server running? Try: npm start' : err.message
    );
  }
}
