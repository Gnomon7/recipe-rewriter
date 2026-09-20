function getRecipeId() {
  return new URLSearchParams(window.location.search).get('id');
}

// Escapes untrusted text first, then promotes {{...}} markers (added by the
// rewriter engines) into highlighted spans -- safe because escaping runs before
// the marker substitution and {{ }} aren't HTML metacharacters.
function renderMeasureText(text) {
  return escapeHtml(text).replace(/\{\{(.+?)\}\}/g, '<strong class="measure">$1</strong>');
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
    document.title = `${recipe.title} — Recipe Book`;
    document.getElementById('title').textContent = recipe.title;

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

    document.getElementById('ingredients').innerHTML = recipe.ingredients
      .map((i) => `<li>${escapeHtml(i)}</li>`).join('');

    const steps = (recipe.instructionsRewritten && recipe.instructionsRewritten.length)
      ? recipe.instructionsRewritten
      : recipe.instructionsOriginal;
    document.getElementById('instructions').innerHTML = steps
      .map((s) => `<li>${renderMeasureText(s)}</li>`).join('');

    if (recipe.rewriteError) {
      const warn = document.getElementById('rewrite-warning');
      warn.hidden = false;
      warn.textContent = `Note: automatic measurement rewriting failed (${recipe.rewriteError}). Showing original instructions instead.`;
    }

    document.getElementById('keep-btn').addEventListener('click', () => {
      const list = [recipe.title, '', ...recipe.ingredients].join('\n');
      navigator.clipboard.writeText(list)
        .then(() => {
          window.open('https://keep.google.com/u/0/#NEW', '_blank', 'noopener');
          flashKeepButton();
        })
        .catch(() => alert('Could not copy to clipboard. Please allow clipboard access and try again.'));
    });

    document.getElementById('delete-btn').addEventListener('click', async () => {
      if (!confirm('Remove this recipe from your book?')) return;
      await fetchJson(`${API_BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      window.location.href = 'index.html';
    });
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
