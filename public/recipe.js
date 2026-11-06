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

let madeDatesRenderedOnce = false;

function renderMadeDates() {
  const dates = getMadeDates(currentRecipe).slice().sort().reverse();
  const history = document.getElementById('made-history');
  // Stays collapsed on page load even if history already exists -- that's
  // the whole point of tucking it away. Only auto-opens for feedback right
  // after a *live* change during this visit (marking made, or removing the
  // last date and re-adding one).
  const justGotFirstEntry = madeDatesRenderedOnce && history.hidden && dates.length > 0;
  history.hidden = dates.length === 0;
  if (justGotFirstEntry) history.open = true;
  madeDatesRenderedOnce = true;
  document.getElementById('made-history-summary').textContent = `Cooking History (${dates.length})`;

  const list = document.getElementById('made-dates');
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

function renderHeading() {
  document.title = `${currentRecipe.title} — Recipe Book`;
  document.getElementById('title').textContent = currentRecipe.title;
  document.getElementById('tags').innerHTML = (currentRecipe.tags || [])
    .map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('');
}

// --- WYSIWYG editing (live app only) ----------------------------------------
// Edit mode swaps the page's own title / tags / ingredients / steps for
// editable versions of the *stored* text (never the unit-converted, scaled
// display text -- saving that would bake a 2x metric view into the recipe),
// so scale/unit/Keep controls are off while editing. Steps keep their
// {{qty unit}} measure markers as highlighted pills, exactly as they render.

let isEditing = false;
let editDirty = false;
let lastSaveAt = 0;
let editTags = [];

// A capture, delete, or made-date change elsewhere would normally reload this
// page (see app.js) -- which would throw away unsaved edits, and would also
// needlessly bounce the page right after our own save.
window.onRecipesChanged = () => {
  if (isEditing || Date.now() - lastSaveAt < 3000) return;
  window.location.reload();
};

window.addEventListener('beforeunload', (e) => {
  if (isEditing && editDirty) { e.preventDefault(); e.returnValue = ''; }
});

function setEditStatus(message, isError = false) {
  const el = document.getElementById('edit-status');
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function focusEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function unwrapEl(el) {
  while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
  el.remove();
}

function stepToEditorHtml(step) {
  return escapeHtml(step).replace(/\{\{(.+?)\}\}/g, '<strong class="measure">$1</strong>');
}

// Turns an editable step back into stored text: highlighted spans become
// {{...}} markers again, anything else the browser may have injected
// (<div>, <span>, <br>) is flattened to plain text.
function serializeStep(root) {
  let text = '';
  (function walk(node) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) { text += child.nodeValue; return; }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (child.tagName === 'BR') { text += ' '; return; }
      if (child.tagName === 'STRONG' || child.tagName === 'B') {
        const raw = child.textContent;
        const inner = raw.replace(/\s+/g, ' ').trim();
        if (inner) text += `${/^\s/.test(raw) ? ' ' : ''}{{${inner}}}${/\s$/.test(raw) ? ' ' : ''}`;
        return;
      }
      walk(child);
    });
  })(root);
  return text.replace(/\s+/g, ' ').trim();
}

function plainText(el) {
  return el.textContent.replace(/\s+/g, ' ').trim();
}

// Shared behaviour for every editable field: paste as plain text only (no
// rich HTML from other sites), mark the form dirty on typing.
function wireEditable(el, { onEnter, onBackspaceEmpty } = {}) {
  el.addEventListener('input', () => { editDirty = true; });
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\s*\n+\s*/g, ' ');
    const sel = window.getSelection();
    if (!text || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    editDirty = true;
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (onEnter) onEnter();
    } else if (e.key === 'Backspace' && onBackspaceEmpty && el.textContent === '') {
      e.preventDefault();
      onBackspaceEmpty();
    }
  });
}

function makeEditRow(kind, html) {
  const li = document.createElement('li');
  li.className = 'edit-row';
  const field = document.createElement('div');
  field.className = 'edit-field';
  field.dataset.kind = kind;
  field.contentEditable = 'true';
  field.innerHTML = html;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'edit-remove';
  remove.textContent = '×';
  remove.title = 'Remove';
  remove.setAttribute('aria-label', 'Remove');
  li.append(field, remove);

  remove.addEventListener('click', () => { li.remove(); editDirty = true; });
  wireEditable(field, {
    onEnter: () => {
      const next = makeEditRow(kind, '');
      li.after(next);
      next.querySelector('.edit-field').focus();
      editDirty = true;
    },
    onBackspaceEmpty: () => {
      const prev = li.previousElementSibling;
      li.remove();
      editDirty = true;
      if (prev) focusEnd(prev.querySelector('.edit-field'));
    },
  });
  return li;
}

function addEditRow(listId, kind) {
  const row = makeEditRow(kind, '');
  document.getElementById(listId).append(row);
  row.querySelector('.edit-field').focus();
  editDirty = true;
}

function ensureTagOptions() {
  if (document.getElementById('tag-options')) return;
  const list = document.createElement('datalist');
  list.id = 'tag-options';
  Array.from(ALL_TAGS).sort().forEach((t) => {
    const option = document.createElement('option');
    option.value = t.replace(/\b\w/g, (c) => c.toUpperCase());
    list.append(option);
  });
  document.body.append(list);
}

function addPendingTag(input) {
  const value = input.value.trim();
  input.value = '';
  if (value && !editTags.some((t) => t.toLowerCase() === value.toLowerCase())) {
    editTags.push(value);
    editDirty = true;
  }
}

function renderTagEditor(refocus = false) {
  const wrap = document.getElementById('tags');
  wrap.innerHTML = '';
  editTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip tag-chip-edit';
    chip.append(document.createTextNode(tag));
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = `Remove ${tag}`;
    x.setAttribute('aria-label', `Remove tag ${tag}`);
    x.addEventListener('click', () => { editTags.splice(i, 1); editDirty = true; renderTagEditor(); });
    chip.append(x);
    wrap.append(chip);
  });

  const input = document.createElement('input');
  input.className = 'tag-add-input';
  input.setAttribute('list', 'tag-options');
  input.placeholder = 'Add tag…';
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Add a tag');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addPendingTag(input); renderTagEditor(true); }
  });
  // Fires when a datalist suggestion is picked (and on blur, where an empty
  // box is a no-op) -- no refocus here so it never fights a click elsewhere.
  input.addEventListener('change', () => { if (input.value.trim()) { addPendingTag(input); renderTagEditor(); } });
  wrap.append(input);
  if (refocus) input.focus();
}

function toggleMeasure() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) { setEditStatus('Click into a step and select the text to highlight first.'); return; }
  const range = sel.getRangeAt(0);
  const anchor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  const field = anchor && anchor.closest('.edit-field[data-kind="step"]');
  if (!field) { setEditStatus('Click into a step and select the text to highlight first.'); return; }

  const existing = anchor.closest('.measure');
  if (existing && field.contains(existing)) {
    unwrapEl(existing);
  } else if (!range.collapsed) {
    const strong = document.createElement('strong');
    strong.className = 'measure';
    strong.append(range.extractContents());
    strong.querySelectorAll('strong, b').forEach(unwrapEl);
    range.insertNode(strong);
    sel.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(strong);
    sel.addRange(after);
  } else {
    setEditStatus('Select the quantity first (e.g. "2 cups"), then click.');
    return;
  }
  field.normalize();
  editDirty = true;
  setEditStatus('');
}

function enterEditMode() {
  if (isEditing || IS_STATIC || !currentRecipe) return;
  isEditing = true;
  editDirty = false;
  document.body.classList.add('editing');
  currentMultiplier = 1;
  currentSystem = 'us';
  renderControlButtons();
  document.getElementById('edit-btn').hidden = true;
  document.getElementById('edit-bar').hidden = false;
  setEditStatus('');

  const titleEl = document.getElementById('title');
  titleEl.textContent = currentRecipe.title;
  titleEl.contentEditable = 'true';

  editTags = (currentRecipe.tags || []).slice();
  ensureTagOptions();
  renderTagEditor();

  const ingredients = document.getElementById('ingredients');
  ingredients.innerHTML = '';
  currentRecipe.ingredients.forEach((i) => ingredients.append(makeEditRow('ingredient', escapeHtml(i))));

  const steps = (currentRecipe.instructionsRewritten && currentRecipe.instructionsRewritten.length)
    ? currentRecipe.instructionsRewritten
    : currentRecipe.instructionsOriginal;
  const list = document.getElementById('instructions');
  list.innerHTML = '';
  steps.forEach((s) => list.append(makeEditRow('step', stepToEditorHtml(s))));

  titleEl.focus();
}

function exitEditMode() {
  isEditing = false;
  editDirty = false;
  document.body.classList.remove('editing');
  document.getElementById('title').removeAttribute('contenteditable');
  document.getElementById('edit-bar').hidden = true;
  document.getElementById('edit-btn').hidden = false;
  renderHeading();
  rerender();
}

function cancelEdit() {
  if (editDirty && !confirm('Discard your changes to this recipe?')) return;
  exitEditMode();
}

async function saveEdit() {
  const pending = document.querySelector('.tag-add-input');
  if (pending) addPendingTag(pending);

  const payload = {
    title: plainText(document.getElementById('title')),
    tags: editTags,
    ingredients: Array.from(document.querySelectorAll('#ingredients .edit-field')).map(plainText).filter(Boolean),
    instructions: Array.from(document.querySelectorAll('#instructions .edit-field')).map(serializeStep).filter(Boolean),
  };
  if (!payload.title) { setEditStatus('A recipe needs a title.', true); return; }
  if (!payload.ingredients.length || !payload.instructions.length) {
    setEditStatus('Keep at least one ingredient and one step.', true);
    return;
  }

  const saveBtn = document.getElementById('save-edit-btn');
  saveBtn.disabled = true;
  setEditStatus('Saving…');
  try {
    const { recipe, droppedTags } = await fetchJson(`${API_BASE}/${encodeURIComponent(currentRecipe.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    lastSaveAt = Date.now();
    currentRecipe = recipe;
    exitEditMode();
    const warn = document.getElementById('rewrite-warning');
    if (droppedTags && droppedTags.length) {
      warn.hidden = false;
      warn.textContent = `Saved. These tags weren't kept, since tags are limited to meal types, ingredients, and cuisines: ${droppedTags.join(', ')}.`;
    } else {
      warn.hidden = true;
    }
  } catch (err) {
    setEditStatus(`Could not save: ${err.message}`, true);
  } finally {
    saveBtn.disabled = false;
  }
}

function initEditor() {
  const editBtn = document.getElementById('edit-btn');
  if (IS_STATIC) return;
  editBtn.hidden = false;
  editBtn.addEventListener('click', enterEditMode);
  document.getElementById('save-edit-btn').addEventListener('click', saveEdit);
  document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);
  const measureBtn = document.getElementById('measure-btn');
  // Keeps the text selection (and focus) in the step while the button is pressed.
  measureBtn.addEventListener('mousedown', (e) => e.preventDefault());
  measureBtn.addEventListener('click', toggleMeasure);
  document.getElementById('add-ingredient-btn').addEventListener('click', () => addEditRow('ingredients', 'ingredient'));
  document.getElementById('add-step-btn').addEventListener('click', () => addEditRow('instructions', 'step'));
  wireEditable(document.getElementById('title'), { onEnter: () => document.getElementById('title').blur() });
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
    renderHeading();
    initEditor();

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
