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

  // recipeCategory/recipeCuisine/keywords can each be a plain string, a
  // comma-separated string, or an array -- normalize all three shapes to a
  // flat list of tag strings.
  function toStringArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(toStringArray);
    if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
  }

  // suitableForDiet uses schema.org's RestrictedDiet enum, given as a full
  // URL ("https://schema.org/VeganDiet"), a bare name, or occasionally an
  // object -- map it to a friendly label, or drop it if unrecognized.
  const DIET_LABELS = {
    diabeticdiet: 'Diabetic', glutenfreediet: 'Gluten-Free', halaldiet: 'Halal',
    hindudiet: 'Hindu', kosherdiet: 'Kosher', lowcaloriediet: 'Low-Calorie',
    lowfatdiet: 'Low-Fat', lowlactosediet: 'Low-Lactose', lowsodiumdiet: 'Low-Sodium',
    paleodiet: 'Paleo', vegandiet: 'Vegan', vegetariandiet: 'Vegetarian',
  };

  function dietTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(dietTags);
    let raw = value;
    if (typeof value === 'object') raw = value['@id'] || value.name || '';
    if (typeof raw !== 'string') return [];
    const slug = raw.split('/').pop().toLowerCase();
    const label = DIET_LABELS[slug];
    return label ? [label] : [];
  }

  function tagsFrom(recipe) {
    const tags = [
      ...toStringArray(recipe.recipeCategory),
      ...toStringArray(recipe.recipeCuisine),
      ...toStringArray(recipe.keywords),
      ...dietTags(recipe.suitableForDiet),
    ];
    return Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  }

  // schema.org's nutrition.calories is free text ("270 calories", "270kcal",
  // sometimes a range) -- pull the first number out for sorting/filtering,
  // and keep null when there's nothing to parse rather than guessing.
  function caloriesFrom(recipe) {
    const value = recipe.nutrition && recipe.nutrition.calories;
    if (!value) return null;
    const match = String(value).match(/(\d+(?:\.\d+)?)/);
    return match ? Math.round(parseFloat(match[1])) : null;
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
            tags: tagsFrom(recipe),
            calories: caloriesFrom(recipe),
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
    const tagEls = document.querySelectorAll('[itemprop="recipeCategory"], [itemprop="recipeCuisine"], [itemprop="keywords"]');
    const caloriesEl = document.querySelector('[itemprop="calories"]');
    return {
      title: document.querySelector('[itemprop="name"]')?.textContent?.trim() || document.title,
      image: document.querySelector('[itemprop="image"]')?.src || '',
      ingredients: Array.from(ingredientEls).map((el) => el.textContent.trim()).filter(Boolean),
      instructions: Array.from(instructionEls).map((el) => el.textContent.trim()).filter(Boolean),
      tags: Array.from(new Set(Array.from(tagEls).flatMap((el) => toStringArray(el.textContent)))),
      calories: caloriesFrom({ nutrition: { calories: caloriesEl?.textContent } }),
    };
  }

  function fromFallback() {
    return {
      title: document.title,
      image: document.querySelector('meta[property="og:image"]')?.content || '',
      ingredients: [],
      instructions: [],
      tags: [],
      calories: null,
    };
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // A small confirm dialog injected into the page, so capturing a recipe is
  // a deliberate click rather than something that fires the instant the
  // toolbar icon is pressed. Built in a shadow root so it can't be broken by
  // (or break) the host page's own CSS, whatever site this runs on.
  function showConfirmModal(title) {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          .overlay {
            position: fixed; inset: 0;
            background: rgba(20, 14, 10, 0.55);
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          }
          .modal {
            background: #fbf6ee;
            color: #3a2e27;
            border-radius: 14px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            padding: 1.4rem 1.5rem;
            width: min(320px, 90vw);
            text-align: center;
          }
          .modal p.question { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.4rem; }
          .modal p.detail { font-size: 0.85rem; color: #6b5c50; margin: 0 0 1.1rem; word-break: break-word; }
          .actions { display: flex; gap: 0.6rem; }
          button {
            flex: 1; border: none; border-radius: 10px; padding: 0.6rem 0.8rem;
            font-size: 0.92rem; font-weight: 600; cursor: pointer;
          }
          .cancel { background: #e8dcc8; color: #3a2e27; }
          .send { background: #c46a3f; color: #fff; }
          .send:hover { background: #a5502a; }
        </style>
        <div class="overlay">
          <div class="modal" role="dialog" aria-modal="true">
            <p class="question">Send this to Recipe Rewriter?</p>
            ${title ? `<p class="detail">${escapeHtml(title)}</p>` : ''}
            <div class="actions">
              <button type="button" class="cancel">Cancel</button>
              <button type="button" class="send">Send</button>
            </div>
          </div>
        </div>`;
      document.documentElement.appendChild(host);

      const onKey = (e) => {
        if (e.key === 'Escape') finish(false);
      };
      function finish(result) {
        document.removeEventListener('keydown', onKey);
        host.remove();
        resolve(result);
      }

      shadow.querySelector('.send').addEventListener('click', () => finish(true));
      shadow.querySelector('.cancel').addEventListener('click', () => finish(false));
      shadow.querySelector('.overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) finish(false);
      });
      document.addEventListener('keydown', onKey);
      shadow.querySelector('.send').focus();
    });
  }

  async function run() {
    console.log('[recipe-book] content script running on', window.location.href);
    const result = fromJsonLd() || fromMicrodata() || fromFallback();
    result.sourceUrl = window.location.href;
    console.log('[recipe-book] extracted:', result);

    // No recipe data found -- nothing to confirm, let background.js report
    // "no recipe found" the same way it always has.
    if (!result.ingredients.length || !result.instructions.length) {
      chrome.runtime.sendMessage({ type: 'RECIPE_CAPTURED', payload: result });
      return;
    }

    const confirmed = await showConfirmModal(result.title);
    if (!confirmed) {
      console.log('[recipe-book] capture cancelled by user');
      return;
    }
    chrome.runtime.sendMessage({ type: 'RECIPE_CAPTURED', payload: result });
  }

  run();
})();
