let allRecipes = [];
let activeTag = null;

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

async function loadRecipes() {
  const grid = document.getElementById('recipe-grid');
  const empty = document.getElementById('empty-state');
  const tagline = document.getElementById('tagline');
  if (IS_STATIC && tagline) {
    tagline.textContent = 'A shared, read-only copy of a recipe book — browse, scale, convert units, and copy shopping lists to Google Keep.';
  }
  try {
    allRecipes = await fetchJson(API_BASE);
    if (!allRecipes.length) {
      empty.hidden = false;
      empty.textContent = IS_STATIC
        ? 'No recipes have been shared yet.'
        : "No recipes yet. Browse to a recipe online, click the Recipe Book extension icon, and it'll show up here.";
      grid.innerHTML = '';
      renderTagFilter();
      return;
    }
    empty.hidden = true;
    renderTagFilter();
    renderGrid();
  } catch (err) {
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
      activeTag = activeTag && activeTag.toLowerCase() === tag.toLowerCase() ? null : tag;
      renderTagFilter();
      renderGrid();
    });
  });
}

function renderGrid() {
  const grid = document.getElementById('recipe-grid');
  const filtered = activeTag ? allRecipes.filter((r) => hasTag(r, activeTag)) : allRecipes;
  grid.innerHTML = filtered.length
    ? filtered.map(cardHtml).join('')
    : `<p class="empty-state">No recipes tagged "${escapeHtml(activeTag)}".</p>`;
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
  const tagsHtml = (recipe.tags || [])
    .slice(0, 3)
    .map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`)
    .join('');

  return `
    <div class="card" data-id="${escapeHtml(recipe.id)}" tabindex="0" role="link">
      ${deleteBtn}
      <div class="card-image" style="${img ? `background-image:url('${imgAttr}')` : ''}">${img ? '' : '🍽️'}</div>
      <div class="card-body">
        <h3>${escapeHtml(recipe.title)}</h3>
        ${tagsHtml ? `<div class="tag-row">${tagsHtml}</div>` : ''}
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

loadRecipes();
