// Tag taxonomy and aggregate-stat helpers shared by book.js (recipe list +
// filtering) and dashboard.js (charts). Pure functions over a recipes array
// -- no DOM access here, so both pages can reuse them identically.

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

function hasAllTags(recipe, tags) {
  return tags.every((t) => hasTag(recipe, t));
}

// Most frequent tag among `recipes` whose lowercased form is in `allowedSet`,
// merging case variants of the same tag into one count.
function topTagFrom(recipes, allowedSet) {
  const counts = countTagsFrom(recipes, allowedSet);
  let best = null;
  for (const entry of counts) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best;
}

// Every tag from `allowedSet` that appears on at least one recipe, with its
// count -- case variants merged into one entry, sorted most-frequent first.
function countTagsFrom(recipes, allowedSet) {
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
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
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

// Recipes added per calendar month, chronological, zero-filled for any month
// in range with no additions (so a bar chart shows real gaps, not a
// misleadingly compressed timeline).
function recipesByMonth(recipes) {
  const withDates = recipes
    .map((r) => r.createdAt)
    .filter((d) => typeof d === 'string' && d.length >= 7)
    .map((d) => d.slice(0, 7))
    .sort();
  if (!withDates.length) return [];

  const counts = new Map();
  for (const month of withDates) counts.set(month, (counts.get(month) || 0) + 1);

  const [startY, startM] = withDates[0].split('-').map(Number);
  const [endY, endM] = withDates[withDates.length - 1].split('-').map(Number);
  const months = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push({ month: key, count: counts.get(key) || 0 });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
