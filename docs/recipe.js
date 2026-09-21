function getRecipeId() {
  return new URLSearchParams(window.location.search).get('id');
}

let currentRecipe = null;
let currentMultiplier = 1;
let currentSystem = 'us';

// Single place that combines both transforms in the right order: convert
// the unit system first (which may change both the number and the unit),
// then scale the result by the multiplier. `nameHint` is only needed for
// bare "qty unit" fragments (see convertMeasurementSystem's doc comment).
function applyMeasurement(text, nameHint) {
  return scaleQuantityText(convertMeasurementSystem(text, currentSystem, nameHint), currentMultiplier);
}

// Escapes untrusted text first, then promotes {{...}} markers (added by the
// rewriter engines) into highlighted spans -- safe because escaping runs before
// the marker substitution and {{ }} aren't HTML metacharacters. A marker's
// inner text is just "qty unit" (the ingredient name sits outside it in the
// sentence, e.g. "{{2 cups}} flour"), so the word(s) immediately following
// the marker are captured too and passed along as a density-lookup hint,
// then re-emitted as plain text after the highlighted pill. Oven
// temperatures in the surrounding prose are annotated separately, before
// escaping.
function renderMeasureText(text) {
  const withTemp = convertTemperatureText(text, currentSystem);
  return escapeHtml(withTemp).replace(
    /\{\{(.+?)\}\}(\s*[A-Za-z]+(?:\s+[A-Za-z]+){0,2})?/g,
    (_, measure, trailingWords) => {
      const hint = (trailingWords || '').trim();
      const converted = applyMeasurement(measure, hint);
      return `<strong class="measure">${escapeHtml(converted)}</strong>${escapeHtml(trailingWords || '')}`;
    }
  );
}

function renderIngredients() {
  document.getElementById('ingredients').innerHTML = currentRecipe.ingredients
    .map((i) => `<li>${escapeHtml(applyMeasurement(i))}</li>`).join('');
}

function renderInstructions() {
  const steps = (currentRecipe.instructionsRewritten && currentRecipe.instructionsRewritten.length)
    ? currentRecipe.instructionsRewritten
    : currentRecipe.instructionsOriginal;
  document.getElementById('instructions').innerHTML = steps
    .map((s) => `<li>${renderMeasureText(s)}</li>`).join('');
}

function renderControlButtons() {
  document.querySelectorAll('#scale-controls .scale-btn').forEach((btn) => {
    const isActive = Number(btn.dataset.multiplier) === currentMultiplier;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
  document.querySelectorAll('#system-controls .scale-btn').forEach((btn) => {
    const isActive = btn.dataset.system === currentSystem;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

function rerender() {
  renderIngredients();
  renderInstructions();
  renderControlButtons();
}

function formatMadeDate(iso) {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function renderMadeDates() {
  const dates = getMadeDates(currentRecipe).slice().sort().reverse();
  const list = document.getElementById('made-dates');
  const empty = document.getElementById('made-empty');
  empty.hidden = dates.length > 0;
  list.innerHTML = dates
    .map((d) => `
      <li>
        <span>${escapeHtml(formatMadeDate(d))}</span>
        <button type="button" class="made-remove" data-date="${escapeHtml(d)}" title="Remove this date" aria-label="Remove this date">&times;</button>
      </li>`)
    .join('');
  list.querySelectorAll('.made-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      currentRecipe.madeDates = await removeMadeDate(currentRecipe.id, btn.dataset.date);
      renderMadeDates();
    });
  });
}

async function loadRecipe() {
  const id = getRecipeId();
  const container = document.getElementById('recipe');
  if (!id) {
    container.innerHTML = '<p class="error">No recipe specified.</p>';
    return;
  }

  try {
    const recipe = await fetchJson(`${API_BASE}/${encodeURIComponent(id)}`);
    currentRecipe = recipe;
    document.title = `${recipe.title} — Recipe Book`;
    document.getElementById('title').textContent = recipe.title;

    document.getElementById('tags').innerHTML = (recipe.tags || [])
      .map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('');

    const source = safeUrl(recipe.sourceUrl);
    if (source) {
      const sourceEl = document.getElementById('source-link');
      sourceEl.href = source;
      sourceEl.textContent = `View original on ${hostnameOf(source) || 'source site'}`;
      sourceEl.hidden = false;
    }

    const img = safeUrl(recipe.image);
    if (img) {
      const imgEl = document.getElementById('hero-image');
      imgEl.src = img;
      imgEl.alt = recipe.title;
      imgEl.hidden = false;
    }

    rerender();
    renderMadeDates();
    document.getElementById('made-static-note').hidden = !IS_STATIC;
    document.getElementById('mark-made-btn').addEventListener('click', async () => {
      currentRecipe.madeDates = await addMadeDate(currentRecipe.id);
      renderMadeDates();
    });

    document.querySelectorAll('#scale-controls .scale-btn').forEach((btn) => {
      btn.addEventListener('click', () => { currentMultiplier = Number(btn.dataset.multiplier); rerender(); });
    });
    document.querySelectorAll('#system-controls .scale-btn').forEach((btn) => {
      btn.addEventListener('click', () => { currentSystem = btn.dataset.system; rerender(); });
    });

    if (recipe.rewriteError) {
      const warn = document.getElementById('rewrite-warning');
      warn.hidden = false;
      warn.textContent = `Note: automatic measurement rewriting failed (${recipe.rewriteError}). Showing original instructions instead.`;
    }

    document.getElementById('keep-btn').addEventListener('click', () => {
      const convertedIngredients = currentRecipe.ingredients.map(applyMeasurement);
      const suffix = [currentMultiplier > 1 ? `${currentMultiplier}x` : '', currentSystem === 'metric' ? 'Metric' : '']
        .filter(Boolean).join(', ');
      const title = suffix ? `${currentRecipe.title} (${suffix})` : currentRecipe.title;
      const list = [title, '', ...convertedIngredients].join('\n');
      navigator.clipboard.writeText(list)
        .then(() => {
          window.open('https://keep.google.com/u/0/#NEW', '_blank', 'noopener');
          flashKeepButton();
        })
        .catch(() => alert('Could not copy to clipboard. Please allow clipboard access and try again.'));
    });

    const deleteBtn = document.getElementById('delete-btn');
    if (IS_STATIC) {
      deleteBtn.hidden = true;
    } else {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Remove this recipe from your book?')) return;
        await fetchJson(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        window.location.href = 'index.html';
      });
    }
  } catch (err) {
    container.innerHTML = `<p class="error">Could not load recipe: ${escapeHtml(err.message)}</p>`;
  }
}

function flashKeepButton() {
  const btn = document.getElementById('keep-btn');
  const original = btn.textContent;
  btn.textContent = 'Copied! Opening Keep…';
  setTimeout(() => { btn.textContent = original; }, 2200);
}

loadRecipe();
