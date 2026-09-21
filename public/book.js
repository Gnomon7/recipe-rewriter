let allRecipes = [];
let activeTag = null;
let searchQuery = '';
let sortMode = 'newest';

const MEAL_TYPE_TAGS = new Set([
  'breakfast', 'brunch', 'lunch', 'dinner', 'dessert', 'snack', 'appetizer',
  'side dish', 'soup', 'salad', 'beverage', 'main course', 'main dish', 'entree',
]);
const PROTEIN_TAGS = new Set([
  'chicken', 'beef', 'pork', 'bacon', 'sausage', 'ham', 'turkey', 'lamb',
  'shrimp', 'salmon', 'tuna', 'fish', 'tofu', 'eggs',
]);

// Dedupes tags case-insensitively across all recipes (source sites vary in
// casing -- "Dinner" vs "DINNER") while keeping one consistent display form.
function collectTags(recipes) {
  const seen = new Map();
  for (const r of recipes) {
    for (const t of r.tags || []) {
      const key = t.toLowerCase();
      if (!seen.has(key)) seen.set(key, t);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

function hasTag(recipe, tag) {
  return (recipe.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase());
}

// Most frequent tag among `recipes` whose lowercased form is in `allowedSet`,
// merging case variants of the same tag into one count.
function topTagFrom(recipes, allowedSet) {
  const counts = new Map();
  for (const r of recipes) {
    for (const t of r.tags || []) {
      const key = t.toLowerCase();
      if (!allowedSet.has(key)) continue;
      const entry = counts.get(key) || { label: t, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best;
}

function computeStats(recipes) {
  const calorieList = recipes.map((r) => r.calories).filter((c) => typeof c === 'number');
  return {
    total: recipes.length,
    topMealType: topTagFrom(recipes, MEAL_TYPE_TAGS),
    topProtein: topTagFrom(recipes, PROTEIN_TAGS),
    calorieRange: calorieList.length ? { min: Math.min(...calorieList), max: Math.max(...calorieList) } : null,
  };
}

function renderStats() {
  const stats = computeStats(allRecipes);
  const cards = [{ label: 'Recipes', value: String(stats.total) }];
  if (stats.topMealType) cards.push({ label: 'Top meal type', value: `${stats.topMealType.label} (${stats.topMealType.count})` });
  if (stats.topProtein) cards.push({ label: 'Most common protein', value: `${stats.topProtein.label} (${stats.topProtein.count})` });
  cards.push({
    label: 'Calorie range',
    value: stats.calorieRange ? `${stats.calorieRange.min}–${stats.calorieRange.max} cal` : 'No data yet',
  });
  document.getElementById('stats-row').innerHTML = cards
    .map((c) => `
      <div class="stat-card">
        <span class="stat-value">${escapeHtml(c.value)}</span>
        <span class="stat-label">${escapeHtml(c.label)}</span>
      </div>`)
    .join('');
}

function renderRandomMealTypeOptions() {
  const select = document.getElementById('random-meal-type');
  const mealTags = collectTags(allRecipes).filter((t) => MEAL_TYPE_TAGS.has(t.toLowerCase()));
  select.innerHTML = '<option value="">Any meal type</option>'
    + mealTags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
}

// Keeps the meal-type dropdown showing whatever tag is currently active (if
// it's one of the meal-type options), or "Any meal type" otherwise -- the
// dropdown and the tag-filter pills are two views onto the same activeTag.
function syncMealTypeSelect() {
  const select = document.getElementById('random-meal-type');
  const match = Array.from(select.options).find(
    (o) => o.value && activeTag && o.value.toLowerCase() === activeTag.toLowerCase()
  );
  select.value = match ? match.value : '';
}

// Sets the shared tag filter from either the tag-pill bar or the meal-type
// dropdown, and keeps both controls in sync with the result.
function setActiveTag(tag) {
  activeTag = tag || null;
  renderTagFilter();
  syncMealTypeSelect();
  renderGrid();
}

// The recipes currently matching both the tag filter and the search box
// (unsorted) -- shared by the grid and the Random button, so "random" means
// "random among what I'm currently looking at."
function getFilteredRecipes() {
  const byTag = activeTag ? allRecipes.filter((r) => hasTag(r, activeTag)) : allRecipes.slice();
  return byTag.filter((r) => matchesSearch(r, searchQuery));
}

// Searches across everything meaningful about a recipe -- title, tags,
// ingredients, instructions, and source -- not just ingredients, so typing
// a tag ("4th of july"), a recipe name, or a technique all find something.
function matchesSearch(recipe, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    recipe.title,
    ...(recipe.tags || []),
    ...(recipe.ingredients || []),
    ...(recipe.instructionsOriginal || []),
    recipe.sourceUrl,
  ];
  return haystack.some((field) => typeof field === 'string' && field.toLowerCase().includes(q));
}

function sortRecipes(recipes, mode) {
  const hasCal = (r) => typeof r.calories === 'number';
  const arr = recipes.slice();
  if (mode === 'calories-asc' || mode === 'calories-desc') {
    const dir = mode === 'calories-asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (hasCal(a) && hasCal(b)) return (a.calories - b.calories) * dir;
      if (hasCal(a)) return -1; // recipes without calorie data sort to the end either way
      if (hasCal(b)) return 1;
      return 0;
    });
  }
  // 'newest': the store/export already lists recipes newest-first.
  return arr;
}

async function loadRecipes() {
  const grid = document.getElementById('recipe-grid');
  const empty = document.getElementById('empty-state');
  const dashboard = document.getElementById('dashboard');
  const tagline = document.getElementById('tagline');
  if (IS_STATIC && tagline) {
    tagline.textContent = 'A shared, read-only copy of a recipe book — browse, scale, convert units, and copy shopping lists to Google Keep.';
  }
  document.getElementById('refresh-live-btn').hidden = IS_STATIC;
  try {
    allRecipes = await fetchJson(API_BASE);
    if (!allRecipes.length) {
      dashboard.hidden = true;
      empty.hidden = false;
      empty.textContent = IS_STATIC
        ? 'No recipes have been shared yet.'
        : "No recipes yet. Browse to a recipe online, click the Recipe Book extension icon, and it'll show up here.";
      grid.innerHTML = '';
      return;
    }
    empty.hidden = true;
    dashboard.hidden = false;
    renderStats();
    renderRandomMealTypeOptions();
    syncMealTypeSelect();
    renderTagFilter();
    renderGrid();
  } catch (err) {
    dashboard.hidden = true;
    empty.hidden = true;
    grid.innerHTML = `<p class="error">Could not load recipes: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTagFilter() {
  const bar = document.getElementById('tag-filter');
  if (!bar) return;
  const tags = collectTags(allRecipes);
  if (!tags.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  bar.innerHTML = tags
    .map((t) => {
      const isActive = activeTag && activeTag.toLowerCase() === t.toLowerCase();
      return `<button type="button" class="tag-pill${isActive ? ' active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    })
    .join('');
  bar.querySelectorAll('.tag-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      setActiveTag(activeTag && activeTag.toLowerCase() === tag.toLowerCase() ? null : tag);
    });
  });
}

function renderGrid() {
  const grid = document.getElementById('recipe-grid');
  const filtered = sortRecipes(getFilteredRecipes(), sortMode);

  if (!filtered.length) {
    const bits = [];
    if (activeTag) bits.push(`tagged "${escapeHtml(activeTag)}"`);
    if (searchQuery) bits.push(`matching "${escapeHtml(searchQuery)}"`);
    grid.innerHTML = `<p class="empty-state">No recipes ${bits.length ? bits.join(' and ') : 'found'}.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(cardHtml).join('');
  wireCardEvents(grid);
}

function cardHtml(recipe) {
  const img = safeUrl(recipe.image);
  const imgAttr = escapeHtml(img);
  const source = safeUrl(recipe.sourceUrl);
  const hostname = source ? hostnameOf(source) : '';
  const deleteBtn = IS_STATIC
    ? ''
    : `<button class="card-delete" data-delete-id="${escapeHtml(recipe.id)}" title="Remove recipe" aria-label="Remove recipe">&times;</button>`;

  const tagChips = (recipe.tags || []).slice(0, 3).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`);
  if (typeof recipe.calories === 'number') tagChips.push(`<span class="tag-chip cal-chip">${recipe.calories} cal</span>`);
  const madeCount = getMadeDates(recipe).length;
  if (madeCount > 0) tagChips.push(`<span class="tag-chip made-chip">Made ${madeCount}×</span>`);
  const madeBadge = madeCount > 0 ? `<span class="made-badge" title="You've made this">✓</span>` : '';

  return `
    <div class="card" data-id="${escapeHtml(recipe.id)}" tabindex="0" role="link">
      ${deleteBtn}
      ${madeBadge}
      <div class="card-image" style="${img ? `background-image:url('${imgAttr}')` : ''}">${img ? '' : '🍽️'}</div>
      <div class="card-body">
        <h3>${escapeHtml(recipe.title)}</h3>
        ${tagChips.length ? `<div class="tag-row">${tagChips.join('')}</div>` : ''}
        <div class="card-meta">
          ${hostname ? `<span class="card-source">${escapeHtml(hostname)}</span>` : '<span></span>'}
          <span class="card-date">${formatDate(recipe.createdAt)}</span>
        </div>
      </div>
    </div>`;
}

function wireCardEvents(grid) {
  grid.querySelectorAll('.card').forEach((card) => {
    const go = () => { window.location.href = `recipe.html?id=${encodeURIComponent(card.dataset.id)}`; };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  grid.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Remove this recipe from your book?')) return;
      try {
        await fetchJson(`${API_BASE}/${encodeURIComponent(btn.dataset.deleteId)}`, { method: 'DELETE' });
        loadRecipes();
      } catch (err) {
        alert(`Could not remove recipe: ${err.message}`);
      }
    });
  });
}

document.getElementById('ingredient-search').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderGrid();
});

document.getElementById('sort-select').addEventListener('change', (e) => {
  sortMode = e.target.value;
  renderGrid();
});

document.getElementById('random-meal-type').addEventListener('change', (e) => {
  setActiveTag(e.target.value || null);
});

document.getElementById('random-btn').addEventListener('click', () => {
  const pool = getFilteredRecipes();
  if (!pool.length) {
    alert('No recipes match the current filters.');
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  window.location.href = `recipe.html?id=${encodeURIComponent(pick.id)}`;
});

document.getElementById('refresh-live-btn').addEventListener('click', async () => {
  if (!confirm("Publish your current recipes to the live site now? This repo is public, so they'll be visible to anyone with the link.")) return;
  const btn = document.getElementById('refresh-live-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Publishing…';
  try {
    const result = await fetchJson('/api/publish', { method: 'POST' });
    alert(result.message);
  } catch (err) {
    alert(`Could not publish: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

loadRecipes();
