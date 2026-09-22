let allRecipes = [];
let selectedTags = new Set(); // multi-select: a recipe must have every one of these
let searchQuery = '';
let sortMode = 'newest';
let dateFilter = null; // set via a dashboard deep link (?date=YYYY-MM-DD -- day added); cleared by the active-filter banner
let madeOnFilter = null; // set via a dashboard deep link (?madeOn=YYYY-MM-DD -- day cooked); cleared by the active-filter banner
// The Random button's own meal type, deliberately kept out of every filter
// above -- Random is a standalone "surprise me" control, not a view onto
// whatever the search/tags/sort controls currently show.
let randomMealType = '';

// Reads ?tag=, ?mealType=, ?date= and ?madeOn= from the URL (set by the
// dashboard's clickable charts) and applies them as if the user had picked
// them by hand. Called once, before the first render, so the resulting
// filter state is visible in the tag pills / meal-type select /
// active-filter banner rather than silently narrowing the grid.
function applyUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag');
  const mealType = params.get('mealType');
  const date = params.get('date');
  const madeOn = params.get('madeOn');
  if (tag) selectedTags.add(tag);
  if (mealType) {
    for (const t of Array.from(selectedTags)) {
      if (MEAL_TYPE_TAGS.has(t.toLowerCase())) selectedTags.delete(t);
    }
    selectedTags.add(mealType);
  }
  if (date) dateFilter = date;
  if (madeOn) madeOnFilter = madeOn;
}

// The header's Random select and the search bar's filter select both list
// the same available meal types -- shared here for that population only.
// Their *values* are deliberately independent (see syncMealTypeSelects,
// which only ever touches the filter one).
function mealTypeSelects() {
  return document.querySelectorAll('.meal-type-select');
}

function renderMealTypeOptions() {
  const mealTags = collectTags(allRecipes).filter((t) => MEAL_TYPE_TAGS.has(t.toLowerCase()));
  const optionsHtml = '<option value="">Any meal type</option>'
    + mealTags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  mealTypeSelects().forEach((select) => { select.innerHTML = optionsHtml; });
}

// A <select> can only show one value, so #meal-type-filter reflects the
// single meal-type tag in selectedTags if there's exactly one -- otherwise
// (none, or several picked via the tag sidebar) it falls back to "Any meal
// type" rather than guessing. #random-meal-type is never touched here --
// it's its own independent control (see randomMealType).
function syncMealTypeSelects() {
  const select = document.getElementById('meal-type-filter');
  if (!select) return;
  const selectedMealTags = Array.from(selectedTags).filter((t) => MEAL_TYPE_TAGS.has(t.toLowerCase()));
  const value = selectedMealTags.length === 1 ? selectedMealTags[0] : '';
  const match = Array.from(select.options).find(
    (o) => o.value && value && o.value.toLowerCase() === value.toLowerCase()
  );
  select.value = match ? match.value : '';
}

// Toggles one tag's membership in the multi-select set (used by the "Search
// by Tags" pills) without disturbing any other selected tags.
function toggleTag(tag) {
  const key = tag.toLowerCase();
  const existing = Array.from(selectedTags).find((t) => t.toLowerCase() === key);
  if (existing) selectedTags.delete(existing); else selectedTags.add(tag);
  renderTagFilter();
  syncMealTypeSelects();
  renderGrid();
}

// A <select> is inherently single-choice, so picking a meal type there
// replaces any *other* previously-selected meal-type tag (but leaves
// non-meal-type tags from the panel alone) rather than adding to them.
function setMealTypeTag(tag) {
  for (const t of Array.from(selectedTags)) {
    if (MEAL_TYPE_TAGS.has(t.toLowerCase())) selectedTags.delete(t);
  }
  if (tag) selectedTags.add(tag);
  renderTagFilter();
  syncMealTypeSelects();
  renderGrid();
}

// The recipes currently matching every selected tag AND the search box
// (unsorted) -- shared by the grid and the Random button, so "random" means
// "random among what I'm currently looking at."
function getFilteredRecipes() {
  const byTags = selectedTags.size
    ? allRecipes.filter((r) => hasAllTags(r, Array.from(selectedTags)))
    : allRecipes.slice();
  const byDate = dateFilter
    ? byTags.filter((r) => typeof r.createdAt === 'string' && localDateKey(r.createdAt) === dateFilter)
    : byTags;
  // madeOnFilter comes from the dashboard's cooking-frequency chart, which
  // (like everywhere else made-dates show up) reads the visitor's own
  // private log on the static site -- see getMadeDates in app.js.
  const byMadeOn = madeOnFilter
    ? byDate.filter((r) => getMadeDates(r).includes(madeOnFilter))
    : byDate;
  return byMadeOn.filter((r) => matchesSearch(r, searchQuery));
}

function dayFilterLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderActiveFilterBanner() {
  const banner = document.getElementById('active-filter-banner');
  if (!banner) return;
  if (!dateFilter && !madeOnFilter) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  const bits = [];
  if (dateFilter) bits.push(`added on <strong>${escapeHtml(dayFilterLabel(dateFilter))}</strong>`);
  if (madeOnFilter) bits.push(`made on <strong>${escapeHtml(dayFilterLabel(madeOnFilter))}</strong>`);
  banner.innerHTML = `
    <span>Showing recipes ${bits.join(' and ')}</span>
    <button type="button" id="clear-date-filter" class="btn btn-primary btn-small">Clear</button>`;
  document.getElementById('clear-date-filter').addEventListener('click', () => {
    dateFilter = null;
    madeOnFilter = null;
    history.replaceState(null, '', window.location.pathname);
    renderActiveFilterBanner();
    renderGrid();
  });
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
    tagline.textContent = "A recipe simplifier that lets you browse, scale, convert units, and instantly copy shopping lists to Google Keep.";
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
    applyUrlFilters();
    renderMealTypeOptions();
    syncMealTypeSelects();
    renderTagFilter();
    renderActiveFilterBanner();
    renderGrid();
  } catch (err) {
    dashboard.hidden = true;
    empty.hidden = true;
    grid.innerHTML = `<p class="error">Could not load recipes: ${escapeHtml(err.message)}</p>`;
  }
}

// Meal Type, Ingredient, and Cuisine are curated allowlists (stats.js) --
// the same three the server now restricts tags to at ingest, so nothing
// should land outside them. Anything that still doesn't match (older data
// from before that restriction existed) is simply not shown, rather than
// given a catch-all "Other" section -- those tags were the whole reason
// this sidebar needed grouping in the first place.
const TAG_GROUP_ORDER = ['Meal Type', 'Ingredient', 'Cuisine'];

function categorizeTag(tag) {
  const key = tag.toLowerCase();
  if (MEAL_TYPE_TAGS.has(key)) return 'Meal Type';
  if (CUISINE_TAGS.has(key)) return 'Cuisine';
  if (INGREDIENT_TAGS.has(key)) return 'Ingredient';
  return null;
}

function renderTagFilter() {
  const container = document.getElementById('tag-groups');
  const sidebar = document.getElementById('tag-sidebar');
  const title = document.querySelector('.tag-sidebar-title');
  if (!container) return;
  const tags = collectTags(allRecipes);
  if (!tags.length) {
    if (sidebar) sidebar.hidden = true;
    return;
  }
  if (sidebar) sidebar.hidden = false;

  if (title) {
    title.textContent = selectedTags.size
      ? `Search by Tags (${selectedTags.size} selected)`
      : 'Search by Tags';
  }

  const groups = new Map(TAG_GROUP_ORDER.map((label) => [label, []]));
  for (const t of tags) {
    const group = categorizeTag(t);
    if (group) groups.get(group).push(t);
  }

  const selectedKeys = new Set(Array.from(selectedTags).map((t) => t.toLowerCase()));

  container.innerHTML = TAG_GROUP_ORDER
    .filter((label) => groups.get(label).length)
    .map((label) => {
      const list = groups.get(label);
      const pills = list
        .map((t) => {
          const isActive = selectedKeys.has(t.toLowerCase());
          return `<button type="button" class="tag-pill${isActive ? ' active' : ''}" data-tag="${escapeHtml(t)}" aria-pressed="${isActive}">${escapeHtml(t)}</button>`;
        })
        .join('');
      return `
        <details class="tag-group" open>
          <summary>${escapeHtml(label)} (${list.length})</summary>
          <div class="tag-filter" role="group" aria-label="Filter by ${escapeHtml(label)} tags">${pills}</div>
        </details>`;
    })
    .join('');

  container.querySelectorAll('.tag-pill').forEach((btn) => {
    btn.addEventListener('click', () => toggleTag(btn.dataset.tag));
  });
}

function renderGrid() {
  const grid = document.getElementById('recipe-grid');
  const filtered = sortRecipes(getFilteredRecipes(), sortMode);

  if (!filtered.length) {
    const bits = [];
    if (selectedTags.size) {
      const list = Array.from(selectedTags).map((t) => `"${escapeHtml(t)}"`).join(', ');
      bits.push(`tagged ${list}`);
    }
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

document.getElementById('meal-type-filter').addEventListener('change', (e) => setMealTypeTag(e.target.value || null));

// Random is deliberately self-contained: its own meal-type select, its own
// pool of allRecipes -- never selectedTags, searchQuery, dateFilter,
// madeOnFilter, or sortMode from the rest of the page.
document.getElementById('random-meal-type').addEventListener('change', (e) => {
  randomMealType = e.target.value;
});

document.getElementById('random-btn').addEventListener('click', () => {
  const pool = randomMealType ? allRecipes.filter((r) => hasTag(r, randomMealType)) : allRecipes.slice();
  if (!pool.length) {
    alert('No recipes match that meal type.');
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
