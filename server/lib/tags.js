// Recipe categorization tags come from two sources:
// 1. Source-declared: recipeCategory/recipeCuisine/keywords/suitableForDiet
//    pulled from the page's own structured data (extension/content.js) --
//    trustworthy since the site itself asserts them.
// 2. Derived: a conservative "this ingredient list mentions X" scan below.
//    Deliberately limited to positive "contains" tags (never claims like
//    "vegan" or "gluten-free" based on absence, which would be a mislabeled
//    dietary/allergy safety issue if wrong -- those only come from the
//    source's own explicit suitableForDiet declaration).

const INGREDIENT_TAGS = [
  [/\bchicken\b/i, 'Chicken'],
  [/\bbeef\b/i, 'Beef'],
  [/\bpork\b/i, 'Pork'],
  [/\bbacon\b/i, 'Bacon'],
  [/\bsausage\b/i, 'Sausage'],
  [/\bham\b/i, 'Ham'],
  [/\bturkey\b/i, 'Turkey'],
  [/\blamb\b/i, 'Lamb'],
  [/\bshrimp\b/i, 'Shrimp'],
  [/\bsalmon\b/i, 'Salmon'],
  [/\btuna\b/i, 'Tuna'],
  [/\bfish\b/i, 'Fish'],
  [/\btofu\b/i, 'Tofu'],
  [/\beggs?\b/i, 'Eggs'],
  [/\bpasta\b/i, 'Pasta'],
  [/\bnoodles?\b/i, 'Noodles'],
  [/\brice\b/i, 'Rice'],
  [/\bpotatoe?s?\b/i, 'Potato'],
  [/\bbeans?\b/i, 'Beans'],
  [/\blentils?\b/i, 'Lentils'],
  [/\bquinoa\b/i, 'Quinoa'],
  [/\bcheese\b/i, 'Cheese'],
  [/\bchocolate\b/i, 'Chocolate'],
];

function deriveIngredientTags(ingredients) {
  const text = (ingredients || []).join(' ').toLowerCase();
  const tags = [];
  for (const [pattern, label] of INGREDIENT_TAGS) {
    if (pattern.test(text) && !tags.includes(label)) tags.push(label);
  }
  return tags;
}

// Some sites' `keywords` field leaks internal CMS metadata instead of real
// descriptors -- "shortTitle: X", "CATEGORY: appetizers", "contentId: ...",
// TOTALTIME/FILTERTIME/NUTRITION/OCCASION fields -- always as "key: value".
// Others run a broken cuisine auto-tagger that stamps every ingredient as
// "<ingredient> Cuisine" ("Sausage Cuisine", "Baking Powder Cuisine"). A tag
// should describe the recipe (an ingredient, a meal type, a cuisine/style),
// not restate metadata or the dish's own name.
function isJunkTag(tag, title) {
  const t = String(tag).trim();
  if (!t) return true;
  if (t.includes(':')) return true;
  if (/cuisine/i.test(t)) return true;
  if (/\brecipes?$/i.test(t)) return true; // "recipe" alone, or any "X Recipe(s)" -- never a useful filter, the X (if any) usually already exists as its own clean tag
  if (t.length > 45) return true; // a tag this long is a stray sentence/title, not a descriptor

  const normalize = (s) => s.toLowerCase().replace(/\brecipes?\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const normTag = normalize(t);
  const normTitle = normalize(title || '');
  if (!normTitle) return false;
  if (normTag === normTitle) return true;
  // A multi-word tag that's mostly just the dish's own name (a common SEO
  // keyword pattern -- "cashew chicken stir fry recipe" on a recipe titled
  // exactly that) isn't a useful filter; a single ingredient word that also
  // happens to appear in the title ("Chicken") still is, so this only
  // applies once the tag itself has 2+ words.
  if (normTag.length > 12) {
    const titleWords = new Set(normTitle.split(' ').filter(Boolean));
    const tagWords = normTag.split(' ').filter(Boolean);
    if (tagWords.length >= 2) {
      const overlap = tagWords.filter((w) => titleWords.has(w)).length;
      if (overlap / tagWords.length >= 0.8) return true;
    }
  }
  return false;
}

// Combines any number of tag lists, deduping case-insensitively while
// keeping the first-seen casing (source-declared tags are passed first so
// their casing wins over the derived list's), and dropping junk tags --
// see isJunkTag. `title` is optional; without it, only the
// context-independent checks (colon, cuisine, bare "recipe", length) apply.
function mergeTags(lists, title) {
  const seen = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const tag = String(raw).trim();
      if (!tag || isJunkTag(tag, title)) continue;
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return Array.from(seen.values());
}

module.exports = { deriveIngredientTags, mergeTags, isJunkTag };
