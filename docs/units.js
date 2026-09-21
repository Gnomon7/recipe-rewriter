// --- US <-> Metric unit conversion ---------------------------------------
// US recipes measure dry goods by volume (cups); metric recipes measure by
// weight (grams), which is why a plain unit-factor conversion isn't enough --
// crossing between them requires an ingredient's density. Liquids and
// unrecognized ingredients fall back to a same-category conversion
// (volume<->volume or weight<->weight) rather than guessing a density.

const ML_PER = { tsp: 4.92892, tbsp: 14.7868, cup: 236.588, 'fl oz': 29.5735, pint: 473.176, quart: 946.353, gallon: 3785.41 };
const G_PER = { oz: 28.3495, lb: 453.592 };

const UNIT_ALIASES = {
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', T: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp', t: 'tsp',
  'fl oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  pint: 'pint', pints: 'pint', pt: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart',
  gallon: 'gallon', gallons: 'gallon',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', liter: 'l', liters: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
};

const US_VOLUME_UNITS = new Set(['tsp', 'tbsp', 'cup', 'fl oz', 'pint', 'quart', 'gallon']);
const US_WEIGHT_UNITS = new Set(['oz', 'lb']);
const METRIC_VOLUME_UNITS = new Set(['ml', 'l']);
const METRIC_WEIGHT_UNITS = new Set(['g', 'kg']);

const UNIT_DISPLAY = {
  cup: ['cup', 'cups'], tbsp: ['Tbsp', 'Tbsp'], tsp: ['tsp', 'tsp'], 'fl oz': ['fl oz', 'fl oz'],
  pint: ['pint', 'pints'], quart: ['quart', 'quarts'], gallon: ['gallon', 'gallons'],
  oz: ['oz', 'oz'], lb: ['lb', 'lb'],
  g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['L', 'L'],
};

// Grams per US cup for common dry/solid ingredients -- approximate, since
// actual weight varies with how something is packed or sifted. Matched
// against the ingredient name by substring (longest/most specific wins).
const INGREDIENT_DENSITY_G_PER_CUP = [
  ['powdered sugar', 120], ['confectioners sugar', 120], ['icing sugar', 120],
  ['brown sugar', 220], ['granulated sugar', 200], ['sugar', 200],
  ['bread flour', 127], ['cake flour', 114], ['whole wheat flour', 113], ['all-purpose flour', 120], ['flour', 120],
  ['butter', 227],
  ['cocoa powder', 85], ['cornstarch', 120], ['corn starch', 120],
  ['rolled oats', 90], ['oats', 90], ['rice', 185],
  ['chocolate chips', 170], ['shredded cheese', 110], ['grated parmesan', 100], ['parmesan', 100],
  ['chopped nuts', 120], ['walnuts', 120], ['pecans', 110], ['almonds', 140],
  ['salt', 288], ['baking soda', 220], ['baking powder', 192],
  ['breadcrumbs', 108], ['bread crumbs', 108], ['panko', 50],
  ['peanut butter', 258], ['honey', 340], ['maple syrup', 322],
];

// Liquids stay volume<->volume in metric (ml/L) rather than switching to
// grams -- recipes don't weigh milk even though it technically has a density.
const LIQUID_INGREDIENTS = /\b(water|milk|cream|broth|stock|juice|oil|wine|vinegar|buttermilk|syrup)\b/i;

function findDensity(name) {
  if (LIQUID_INGREDIENTS.test(name)) return null;
  const lower = name.toLowerCase();
  let best = null;
  for (const [key, density] of INGREDIENT_DENSITY_G_PER_CUP) {
    if (lower.includes(key) && (!best || key.length > best.key.length)) best = { key, density };
  }
  return best ? best.density : null;
}

function canonicalUnit(word) {
  return UNIT_ALIASES[word] || UNIT_ALIASES[word.toLowerCase()] || null;
}

function unitLabel(unit, value) {
  const pair = UNIT_DISPLAY[unit] || [unit, unit];
  return value > 1 ? pair[1] : pair[0];
}

function pickMetricVolume(ml) {
  return ml >= 1000 ? { value: ml / 1000, unit: 'l' } : { value: ml, unit: 'ml' };
}

function pickMetricWeight(g) {
  return g >= 1000 ? { value: g / 1000, unit: 'kg' } : { value: g, unit: 'g' };
}

function pickUsVolume(ml) {
  const cups = ml / ML_PER.cup;
  if (cups >= 0.24) return { value: cups, unit: 'cup' };
  const tbsp = ml / ML_PER.tbsp;
  if (tbsp >= 0.9) return { value: tbsp, unit: 'tbsp' };
  return { value: ml / ML_PER.tsp, unit: 'tsp' };
}

function pickUsWeight(oz) {
  return oz >= 16 ? { value: oz / 16, unit: 'lb' } : { value: oz, unit: 'oz' };
}

function formatMetricNumber(value) {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

// Formats a decimal quantity for US display as a whole number + common
// fraction (reuses snapToCommonFraction from app.js), e.g. 1.33 -> "1 1/3".
function formatUsQuantity(value) {
  let whole = Math.floor(value);
  let fracPart = value - whole;
  if (fracPart > 0.94) { whole += 1; fracPart = 0; }
  if (fracPart < 0.06) return String(whole);
  const snapped = snapToCommonFraction(fracPart);
  if (snapped) return whole > 0 ? `${whole} ${snapped.num}/${snapped.den}` : `${snapped.num}/${snapped.den}`;
  const quarters = Math.round(fracPart * 4);
  if (quarters === 0) return String(whole);
  if (quarters === 4) return String(whole + 1);
  const g = gcd(quarters, 4);
  return whole > 0 ? `${whole} ${quarters / g}/${4 / g}` : `${quarters / g}/${4 / g}`;
}

// Mirrors formatUsQuantity's rounding so plurality matches what's actually
// displayed (e.g. a raw 1.01 that rounds down to "1" must read as singular,
// and "1/2" -- a proper fraction -- is singular even though the string
// isn't literally "1").
function isUsQuantityPlural(value) {
  let whole = Math.floor(value);
  let fracPart = value - whole;
  if (fracPart > 0.94) { whole += 1; fracPart = 0; }
  if (fracPart < 0.06) return whole > 1;
  return whole >= 1;
}

// Converts the leading quantity+unit of an ingredient/measurement string
// between US customary and Metric, choosing weight vs. volume the way a
// recipe actually would (density-aware). Returns the input unchanged if
// there's no recognized unit (counts, "to taste", already-correct system).
// `nameHint` supplies the ingredient name when `text` is just a bare
// "qty unit" fragment with no name of its own (e.g. an inlined instruction
// marker like "2 cups", where the ingredient name sits outside the marker
// in the surrounding sentence) -- without it, density lookups can't match
// and volume-to-weight conversions silently fall back to a plain volume
// conversion instead.
function convertMeasurementSystem(text, targetSystem, nameHint) {
  const normalized = String(text).replace(/[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => UNICODE_FRACTIONS[m] || m);
  const qtyPattern = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*/i;
  const match = normalized.match(qtyPattern);
  if (!match) return text;

  const afterQty = normalized.slice(match[0].length);
  const unitMatch = afterQty.match(/^([A-Za-z]+)\.?/);
  if (!unitMatch) return text;
  const unit = canonicalUnit(unitMatch[1]);
  if (!unit) return text;

  const rest = afterQty.slice(unitMatch[0].length);
  const originalName = rest.trim();
  // A hint-only name is used to find a density but never echoed into the
  // output -- the caller supplied it precisely because the name isn't part
  // of this text and will be re-attached separately.
  const ingredientName = originalName || nameHint || '';
  const primaryFrac = parseFractionToken(match[1]);
  if (!primaryFrac) return text;
  const value = primaryFrac.num / primaryFrac.den;

  const isUsVolume = US_VOLUME_UNITS.has(unit);
  const isUsWeight = US_WEIGHT_UNITS.has(unit);
  const isMetricVolume = METRIC_VOLUME_UNITS.has(unit);
  const isMetricWeight = METRIC_WEIGHT_UNITS.has(unit);

  let picked;

  if (targetSystem === 'metric') {
    if (isMetricVolume || isMetricWeight) return text;
    if (isUsVolume) {
      const ml = value * ML_PER[unit];
      const density = findDensity(ingredientName);
      picked = density ? pickMetricWeight((ml / ML_PER.cup) * density) : pickMetricVolume(ml);
    } else if (isUsWeight) {
      picked = pickMetricWeight(value * G_PER[unit]);
    } else {
      return text;
    }
    return `${formatMetricNumber(picked.value)} ${unitLabel(picked.unit, picked.value)} ${originalName}`.trim();
  }

  // targetSystem === 'us'
  if (isUsVolume || isUsWeight) return text;
  if (isMetricVolume) {
    const ml = value * (unit === 'l' ? 1000 : 1);
    picked = pickUsVolume(ml);
  } else if (isMetricWeight) {
    const grams = value * (unit === 'kg' ? 1000 : 1);
    const density = findDensity(ingredientName);
    picked = density ? pickUsVolume((grams / density) * ML_PER.cup) : pickUsWeight(grams / G_PER.oz);
  } else {
    return text;
  }
  const qtyDisplay = formatUsQuantity(picked.value);
  const isPlural = isUsQuantityPlural(picked.value);
  return `${qtyDisplay} ${unitLabel(picked.unit, isPlural ? 2 : 1)} ${originalName}`.trim();
}

// Annotates Fahrenheit/Celsius oven temperatures with their equivalent in
// the target system, e.g. "425F" -> "425F (220°C)". Additive rather than
// replacing, since the original instruction wording should stay intact.
function convertTemperatureText(text, targetSystem) {
  let result = String(text);
  if (targetSystem === 'metric') {
    result = result.replace(/\b(\d{2,3})\s*°?\s*F\b/g, (match, num) => {
      const c = Math.round(((parseInt(num, 10) - 32) * 5) / 9 / 5) * 5;
      return `${match} (${c}°C)`;
    });
  } else {
    result = result.replace(/\b(\d{2,3})\s*°?\s*C\b/g, (match, num) => {
      const f = Math.round((parseInt(num, 10) * 9) / 5 + 32);
      return `${match} (${f}°F)`;
    });
  }
  return result;
}
