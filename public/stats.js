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

// createdAt is stored as a UTC ISO timestamp, but recipe cards display it in
// the viewer's local timezone (via toLocaleDateString) -- bucketing/filtering
// must use that same local calendar day, or a recipe saved just after UTC
// midnight would land in a different day's bar than the one its own card
// shows.
function localDateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Zero-fills a list of YYYY-MM-DD strings into one entry per calendar day
// from the earliest to the latest, so a bar chart shows real gaps (and real
// peaks) instead of a misleadingly compressed timeline. Shared by both the
// "recipes added" and "cooking frequency" charts -- each just supplies a
// different list of dates.
function datesToDayBuckets(dateStrings) {
  const valid = dateStrings.filter((d) => typeof d === 'string' && d.length >= 10).map((d) => d.slice(0, 10)).sort();
  if (!valid.length) return [];

  const counts = new Map();
  for (const day of valid) counts.set(day, (counts.get(day) || 0) + 1);

  const start = new Date(`${valid[0]}T00:00:00`);
  const end = new Date(`${valid[valid.length - 1]}T00:00:00`);
  const days = [];
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: counts.get(key) || 0 });
  }
  return days;
}

// Recipes added per calendar day (local time -- see localDateKey above).
function recipesByDay(recipes) {
  return datesToDayBuckets(recipes.map((r) => (r.createdAt ? localDateKey(r.createdAt) : null)).filter(Boolean));
}

function formatDayLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
