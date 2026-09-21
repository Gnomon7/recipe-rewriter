let allRecipes = [];
let selectedTags = new Set(); // multi-select: a recipe must have every one of these
let searchQuery = '';
let sortMode = 'newest';
let dateFilter = null; // set via a dashboard deep link (?date=YYYY-MM-DD -- day added); cleared by the active-filter banner
let madeOnFilter = null; // set via a dashboard deep link (?madeOn=YYYY-MM-DD -- day cooked); cleared by the active-filter banner

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

// There are two (kept in sync) meal-type dropdowns -- one in the header,
// one next to the search box -- so every place that touches "the" dropdown
// actually operates on all elements with this class.
function mealTypeSelects() {
  return document.querySelectorAll('.meal-type-select');
}

function renderMealTypeOptions() {
  const mealTags = collectTags(allRecipes).filter((t) => MEAL_TYPE_TAGS.has(t.toLowerCase()));
  const optionsHtml = '<option value="">Any meal type</option>'
    + mealTags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  mealTypeSelects().forEach((select) => { select.innerHTML = optionsHtml; });
}

// A <select> can only show one value, so it reflects the single meal-type
// tag in selectedTags if there's exactly one -- otherwise (none, or several
// picked via the multi-select tag panel) it falls back to "Any meal type"
// rather than guessing.
function syncMealTypeSelects() {
  const selectedMealTags = Array.from(selectedTags).filter((t) => MEAL_TYPE_TAGS.has(t.toLowerCase()));
  const value = selectedMealTags.length === 1 ? selectedMealTags[0] : '';
  mealTypeSelects().forEach((select) => {
    const match = Array.from(select.options).find(
      (o) => o.value && value && o.value.toLowerCase() === value.toLowerCase()
    );
    select.value = match ? match.value : '';
  });
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
  // madeOnFilter only ever comes from the dashboard's cooking-frequency
  // chart, which reads real madeDates (see dashboard.js) -- so this filter
  // matches against real data too, not the visitor's private local log,
  // or a real-data chart would drill into an empty "no matches" list.
  const byMadeOn = madeOnFilter
    ? byDate.filter((r) => (r.madeDates || []).includes(madeOnFilter))
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
    if (selectedTags.size) document.getElementById('tag-filter-details').open = true;
  } catch (err) {
    dashboard.hidden = true;
    empty.hidden = true;
    grid.innerHTML = `<p class="error">Could not load recipes: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTagFilter() {
  const bar = document.getElementById('tag-filter');
  const details = document.getElementById('tag-filter-details');
  if (!bar) return;
  const tags = collectTags(allRecipes);
  if (!tags.length) {
    if (details) details.hidden = true;
    return;
  }
  if (details) details.hidden = false;

  const summary = document.querySelector('.tag-filter-summary');
  if (summary) {
    summary.textContent = selectedTags.size
      ? `Search by Tags (${selectedTags.size} selected)`
      : 'Search by Tags';
  }

  const selectedKeys = new Set(Array.from(selectedTags).map((t) => t.toLowerCase()));
  bar.innerHTML = tags
    .map((t) => {
      const isActive = selectedKeys.has(t.toLowerCase());
      return `<button type="button" class="tag-pill${isActive ? ' active' : ''}" data-tag="${escapeHtml(t)}" aria-pressed="${isActive}">${escapeHtml(t)}</button>`;
    })
    .join('');
  bar.querySelectorAll('.tag-pill').forEach((btn) => {
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

mealTypeSelects().forEach((select) => {
  select.addEventListener('change', (e) => setMealTypeTag(e.target.value || null));
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
