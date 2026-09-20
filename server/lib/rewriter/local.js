const { parseIngredient } = require('./parseIngredient');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function singularize(word) {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|ses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// Strips trailing prep notes ("chopped", "divided", "(optional)") and builds
// a few name variants to match against. Recipes shorthand multi-word
// ingredients by either half ("granulated sugar" -> "sugar", "feta cheese" -> "feta"),
// so both the first and last word are tried in addition to the full phrase.
function buildNameVariants(name) {
  const core = name.split(',')[0].replace(/\([^)]*\)/g, '').trim();
  if (!core) return [];
  const variants = new Set([core, singularize(core)]);
  const words = core.split(/\s+/);
  if (words.length > 1) {
    variants.add(words[0]);
    variants.add(singularize(words[0]));
    variants.add(words[words.length - 1]);
    variants.add(singularize(words[words.length - 1]));
  }
  return Array.from(variants).filter((v) => v && v.length > 2);
}

// Splices "{{qty unit}}" markers into the first mention of each ingredient
// across all steps. The frontend renders {{...}} as a highlighted span.
function rewriteLocal({ ingredients, instructions }) {
  const candidates = ingredients
    .map(parseIngredient)
    .filter((p) => p.label)
    .map((p) => ({ ...p, variants: buildNameVariants(p.name) }))
    .sort((a, b) => b.name.length - a.name.length);

  const used = new Set();

  const steps = instructions.map((step) => {
    let text = step;
    for (const candidate of candidates) {
      if (used.has(candidate.raw)) continue;
      for (const variant of candidate.variants) {
        const pattern = new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'i');
        const match = text.match(pattern);
        if (match) {
          text = `${text.slice(0, match.index)}{{${candidate.label}}} ${text.slice(match.index)}`;
          used.add(candidate.raw);
          break;
        }
      }
    }
    return text;
  });

  return { instructions: steps };
}

module.exports = { rewriteLocal };
