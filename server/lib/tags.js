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

// Combines any number of tag lists, deduping case-insensitively while
// keeping the first-seen casing (source-declared tags are passed first so
// their casing wins over the derived list's).
function mergeTags(...lists) {
  const seen = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const tag = String(raw).trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return Array.from(seen.values());
}

module.exports = { deriveIngredientTags, mergeTags };
