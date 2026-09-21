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
// TOTALTIME/FILTERTIME/NUTRITION/OCCASION fields -- always as "key: value" --
// or generic editorial boilerplate ("publisher-tested"). Others run a broken
// cuisine auto-tagger that stamps every ingredient as "<ingredient> Cuisine"
// ("Sausage Cuisine", "Baking Powder Cuisine"), or hand out long-tail SEO
// keyword phrases that just describe the dish a different way ("dairy free
// chocolate cake", "the best lentil balls", "Olive Garden copycat soup") --
// distinct from a real ingredient/meal-type/cuisine tag by being several
// words long with no other job. A tag should name one thing about the
// recipe, not restate metadata or a variant of the dish's own name.
function isJunkTag(tag, title) {
  const t = String(tag).trim();
  if (!t) return true;
  if (t.includes(':')) return true;
  if (/cuisine/i.test(t)) return true;
  if (/\brecipes?$/i.test(t)) return true; // "recipe" alone, or any "X Recipe(s)" -- never a useful filter, the X (if any) usually already exists as its own clean tag
  if (t.length > 45) return true; // a tag this long is a stray sentence/title, not a descriptor
  if (/^(publisher[- ]tested|sponsored|syndicated)$/i.test(t)) return true; // editorial/CMS boilerplate, not a recipe attribute
  if (/\bcopycat\b/i.test(t)) return true; // "X copycat Y" is a comparison, not a descriptor
  if (/^the best\b/i.test(t)) return true; // a marketing superlative about this specific recipe

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    // A few genuinely useful multi-word patterns survive: a quantity/time
    // constraint ("5 ingredients or fewer", "< 60 Mins"), or an occasion
    // phrase ("For Large Groups", "feed a crowd"). A longer tag that isn't
    // one of those is almost always a dish-description variant rather than
    // a real ingredient/meal-type/cuisine tag.
    const firstWord = words[0].toLowerCase();
    const isQuantityOrOccasion = /^\d/.test(words[0]) || /^[<>]/.test(t) || ['for', 'feed', 'after'].includes(firstWord);
    if (!isQuantityOrOccasion) return true;
  }

  // Exact match against the title (ignoring a trailing "recipe(s)" and
  // punctuation) catches the plain case -- a recipe titled "Kale Salad"
  // tagged "kale salad". Deliberately not a fuzzy/partial match: a real
  // ingredient or diet tag ("sour cream", "low carb", "celery root") often
  // legitimately shares words with the title without being a restatement
  // of it, and penalizing that would remove good tags, not just junk ones.
  const normalize = (s) => s.toLowerCase().replace(/\brecipes?\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (title && normalize(t) === normalize(title)) return true;
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
