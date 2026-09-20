const UNICODE_FRACTIONS = {
  '¼': '1/4', '½': '1/2', '¾': '3/4',
  '⅓': '1/3', '⅔': '2/3',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

const UNITS = [
  'fluid ounces', 'fl oz',
  'tablespoons', 'tablespoon', 'tbsp', 'tbsps', 'tbs',
  'teaspoons', 'teaspoon', 'tsp', 'tsps',
  'cups', 'cup',
  'ounces', 'ounce', 'oz',
  'pounds', 'pound', 'lbs', 'lb',
  'kilograms', 'kilogram', 'kg',
  'grams', 'gram', 'g',
  'milliliters', 'milliliter', 'ml',
  'liters', 'liter', 'l',
  'pinches', 'pinch', 'dashes', 'dash',
  'cloves', 'clove',
  'cans', 'can',
  'packages', 'package', 'pkg',
  'sticks', 'stick',
  'slices', 'slice',
  'bunches', 'bunch',
  'sprigs', 'sprig',
  'heads', 'head',
  'quarts', 'quart', 'qt',
  'pints', 'pint', 'pt',
  'large', 'medium', 'small',
].sort((a, b) => b.length - a.length);

function replaceUnicodeFractions(str) {
  return str.replace(/[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => UNICODE_FRACTIONS[m] || m);
}

// Parses a raw ingredient line like "1 1/2 cups granulated sugar" into
// { raw, qty, unit, name, label }. Falls back gracefully when no leading
// quantity is found (e.g. "Salt, to taste") by leaving qty/unit/label empty.
function parseIngredient(rawInput) {
  const original = String(rawInput || '').trim();
  const text = replaceUnicodeFractions(original);

  const qtyPattern = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s+/i;
  const qtyMatch = text.match(qtyPattern);

  let qty = '';
  let rest = text;

  if (qtyMatch) {
    qty = qtyMatch[2] ? `${qtyMatch[1]}-${qtyMatch[2]}` : qtyMatch[1];
    rest = text.slice(qtyMatch[0].length);
  }

  let parenNote = '';
  const parenMatch = rest.match(/^\(([^)]+)\)\s*/);
  if (parenMatch) {
    parenNote = parenMatch[1].trim();
    rest = rest.slice(parenMatch[0].length);
  }

  let unit = '';

  // Standalone "T" (tablespoon) / "t" (teaspoon) are common in baking recipes
  // and must be matched case-sensitively before anything else, since a
  // case-insensitive match would conflate the two different measurements.
  const singleLetterMatch = rest.match(/^([Tt])\.?\s+/);
  if (singleLetterMatch) {
    unit = singleLetterMatch[1] === 'T' ? 'Tbsp' : 'tsp';
    rest = rest.slice(singleLetterMatch[0].length);
  } else {
    for (const u of UNITS) {
      const unitPattern = new RegExp(`^${u}\\.?\\s+`, 'i');
      const m = rest.match(unitPattern);
      if (m) {
        unit = u.toLowerCase();
        rest = rest.slice(m[0].length);
        break;
      }
    }
  }

  if (parenNote) {
    unit = unit ? `${parenNote} ${unit}` : parenNote;
  }

  rest = rest.replace(/^of\s+/i, '').trim();
  const name = rest || original;

  return {
    raw: original,
    qty,
    unit,
    name,
    label: qty ? [qty, unit].filter(Boolean).join(' ').trim() : '',
  };
}

module.exports = { parseIngredient };
