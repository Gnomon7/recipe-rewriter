// Injected on-click by background.js. Extracts a recipe from the current page
// and sends it back via chrome.runtime.sendMessage. Self-contained (no shared
// modules) since Manifest V3 injects this file standalone.
(function () {
  function flattenInstructions(value) {
    if (!value) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(flattenInstructions);
    if (typeof value === 'object') {
      if (value.itemListElement) return flattenInstructions(value.itemListElement);
      if (value.text) return [value.text];
      if (value.name) return [value.name];
    }
    return [];
  }

  function findRecipeNode(node) {
    if (!node || typeof node !== 'object') return null;
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('Recipe')) return node;
    if (Array.isArray(node['@graph'])) {
      for (const item of node['@graph']) {
        const found = findRecipeNode(item);
        if (found) return found;
      }
    }
    return null;
  }

  function imageUrlFrom(image) {
    if (!image) return '';
    if (typeof image === 'string') return image;
    if (Array.isArray(image)) return imageUrlFrom(image[0]);
    if (typeof image === 'object') return image.url || '';
    return '';
  }

  function fromJsonLd() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      let data;
      try {
        data = JSON.parse(script.textContent);
      } catch (e) {
        continue;
      }
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const recipe = findRecipeNode(item);
        if (recipe) {
          return {
            title: recipe.name || document.title,
            image: imageUrlFrom(recipe.image),
            ingredients: recipe.recipeIngredient || recipe.ingredients || [],
            instructions: flattenInstructions(recipe.recipeInstructions),
          };
        }
      }
    }
    return null;
  }

  function fromMicrodata() {
    const ingredientEls = document.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]');
    const instructionEls = document.querySelectorAll('[itemprop="recipeInstructions"]');
    if (!ingredientEls.length || !instructionEls.length) return null;
    return {
      title: document.querySelector('[itemprop="name"]')?.textContent?.trim() || document.title,
      image: document.querySelector('[itemprop="image"]')?.src || '',
      ingredients: Array.from(ingredientEls).map((el) => el.textContent.trim()).filter(Boolean),
      instructions: Array.from(instructionEls).map((el) => el.textContent.trim()).filter(Boolean),
    };
  }

  function fromFallback() {
    return {
      title: document.title,
      image: document.querySelector('meta[property="og:image"]')?.content || '',
      ingredients: [],
      instructions: [],
    };
  }

  console.log('[recipe-book] content script running on', window.location.href);
  const result = fromJsonLd() || fromMicrodata() || fromFallback();
  result.sourceUrl = window.location.href;
  console.log('[recipe-book] extracted:', result);

  chrome.runtime.sendMessage({ type: 'RECIPE_CAPTURED', payload: result });
})();
