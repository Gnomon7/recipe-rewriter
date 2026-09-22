// Recipe categorization tags come from two sources:
// 1. Source-declared: recipeCategory/recipeCuisine/keywords/suitableForDiet
//    pulled from the page's own structured data (extension/content.js).
// 2. Derived: a conservative "this ingredient list mentions X" scan below.
//    Deliberately limited to positive "contains" tags (never claims like
//    "vegan" or "gluten-free" based on absence, which would be a mislabeled
//    dietary/allergy safety issue if wrong -- those only come from the
//    source's own explicit suitableForDiet declaration).
//
// Source-declared tags are frequently noise, not signal: internal CMS
// metadata ("shortTitle: X", "contentId: ..."), a broken per-site cuisine
// auto-tagger ("Sausage Cuisine"), long-tail SEO phrases that just restate
// the dish a different way ("dairy free chocolate cake"), or a dozen near-
// duplicate spellings of the same meal type. Rather than trying to blocklist
// every shape that noise can take, tags are held to an allowlist: a tag
// survives only if it names an ingredient, a meal type, or a cuisine/style
// -- the three things this book actually filters by. A small alias map
// folds known duplicate spellings into one canonical tag before that check,
// so "Main Dishes" and "main-dish" both become "Main Course" instead of
// each being rejected as an unrecognized variant.

const INGREDIENT_DERIVE_PATTERNS = [
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
  for (const [pattern, label] of INGREDIENT_DERIVE_PATTERNS) {
    if (pattern.test(text) && !tags.includes(label)) tags.push(label);
  }
  return tags;
}

// The allowlist. Kept in sync with the identically-named sets in
// public/stats.js, which groups tags into sidebar sections client-side --
// these are the server-side gate that decides what ever reaches storage.
const MEAL_TYPE_TAGS = new Set([
  'breakfast', 'brunch', 'lunch', 'dinner', 'dessert', 'snack', 'appetizer',
  'side dish', 'soup', 'salad', 'beverage', 'main course', 'main dish', 'entree',
]);

const INGREDIENT_TAGS = new Set([
  'chicken', 'beef', 'pork', 'bacon', 'sausage', 'ham', 'turkey', 'lamb',
  'shrimp', 'salmon', 'tuna', 'fish', 'tofu', 'eggs',
  'cheese', 'mozzarella', 'gruyère', 'chocolate', 'rice', 'potato', 'russet potato',
  'sweet potato', 'beans', 'lentils', 'lentil', 'quinoa', 'pasta', 'noodles',
  'avocado', 'broccoli', 'brussels sprout', 'butternut squash', 'chickpea',
  'leek', 'spinach', 'scallion', 'steak', 'cardamom', 'celery root',
  'dijon mustard', 'maple syrup', 'walnut', 'bread', 'bread flour', 'cake flour',
  'cranberry', 'mushroom', 'garlic', 'onion', 'tomato', 'carrot', 'zucchini',
  'kale', 'cauliflower', 'cabbage', 'pepper', 'corn', 'peas', 'apple', 'banana',
  'lemon', 'lime', 'ginger', 'cilantro', 'basil', 'parsley', 'mint', 'honey',
  'butter', 'cream', 'sour cream', 'yogurt', 'milk', 'flour', 'sugar', 'vanilla',
  'cinnamon', 'nutmeg', 'almond flour', 'coconut',
]);

const CUISINE_TAGS = new Set([
  'american', 'u.s.', 'southern', 'tex-mex', 'italian', 'italian inspired',
  'french', 'mexican', 'indian', 'chinese', 'japanese', 'thai', 'vietnamese',
  'korean', 'greek', 'spanish', 'mediterranean', 'middle eastern', 'cajun',
  'creole', 'german', 'irish', 'british', 'caribbean', 'african', 'ethiopian',
  'moroccan', 'turkish', 'eastern european', 'asian', 'asian american',
  'latin american', 'hawaiian', 'scandinavian', 'russian', 'filipino',
  'indonesian', 'cuban', 'brazilian', 'portuguese', 'jamaican', 'lebanese',
  'persian', 'israeli',
]);

// Known duplicate spellings, folded to one canonical tag before the
// allowlist check -- so they're merged into it rather than rejected as an
// unrecognized "Other" variant.
const TAG_ALIASES = new Map([
  ['main', 'Main Course'],
  ['mains', 'Main Course'],
  ['main dishes', 'Main Course'],
  ['main-dish', 'Main Course'],
  ['main dish', 'Main Course'],
  ['desserts', 'Dessert'],
  ['drink', 'Beverage'],
  ['drinks', 'Beverage'],
  ['cocktail', 'Beverage'],
  ['cocktails', 'Beverage'],
]);

function canonicalizeTag(tag) {
  const alias = TAG_ALIASES.get(tag.toLowerCase());
  return alias || tag;
}

function isAllowedTag(tag) {
  const key = tag.toLowerCase();
  return MEAL_TYPE_TAGS.has(key) || INGREDIENT_TAGS.has(key) || CUISINE_TAGS.has(key);
}

// Combines any number of tag lists, deduping case-insensitively while
// keeping the first-seen casing (source-declared tags are passed first so
// their casing wins over the derived list's) -- after canonicalizing known
// alias spellings and dropping anything that isn't an ingredient, meal
// type, or cuisine.
function mergeTags(lists) {
  const seen = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const trimmed = String(raw).trim();
      if (!trimmed) continue;
      const tag = canonicalizeTag(trimmed);
      if (!isAllowedTag(tag)) continue;
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return Array.from(seen.values());
}

module.exports = { deriveIngredientTags, mergeTags, canonicalizeTag, isAllowedTag };
