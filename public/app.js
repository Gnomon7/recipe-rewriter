const API_BASE = '/api/recipes';

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// --- Quantity scaling -------------------------------------------------
// Some sites store ingredient quantities as decimals in their structured
// data (e.g. a recipe plugin doing its own serving-math produces "0.5 cup"
// instead of "1/2 cup"). Scaling by a whole-number multiplier is exact
// fraction arithmetic, so doing it via num/den also cleans decimals into
// fractions as a side effect -- both problems, one code path.

const UNICODE_FRACTIONS = {
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

// Units where recipes conventionally use decimals, not fractions -- scaling
// these stays decimal instead of round-tripping through a fraction.
const DECIMAL_PREFERRED_UNITS = /^(grams?|kilograms?|kg|g|milliliters?|ml|liters?|l)$/i;

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// Recipe decimals are almost always an approximation of one of these (e.g.
// "0.33" meaning 1/3), so snap to the nearest one within a small tolerance
// rather than converting the decimal literally (which would turn 0.33 into
// the exact-but-ugly-and-wrong-intent 33/100).
const COMMON_FRACTIONS = [
  [1, 8], [1, 6], [1, 5], [1, 4], [1, 3], [2, 5], [3, 8],
  [1, 2], [3, 5], [5, 8], [2, 3], [3, 4], [4, 5], [5, 6], [7, 8],
];

function snapToCommonFraction(value) {
  for (const [num, den] of COMMON_FRACTIONS) {
    if (Math.abs(value - num / den) < 0.015) return { num, den };
  }
  return null;
}

function parseFractionToken(token) {
  token = token.trim();
  let m = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) {
    const whole = parseInt(m[1], 10);
    const den = parseInt(m[3], 10);
    return { num: whole * den + parseInt(m[2], 10), den };
  }
  m = token.match(/^(\d+)\/(\d+)$/);
  if (m) return { num: parseInt(m[1], 10), den: parseInt(m[2], 10) };
  m = token.match(/^(\d+)\.(\d+)$/);
  if (m) {
    const whole = parseInt(m[1], 10);
    const fracValue = parseFloat(`0.${m[2]}`);
    const snapped = snapToCommonFraction(fracValue);
    if (snapped) return { num: whole * snapped.den + snapped.num, den: snapped.den };
    const den = Math.pow(10, m[2].length);
    return { num: whole * den + parseInt(m[2], 10), den };
  }
  m = token.match(/^(\d+)$/);
  if (m) return { num: parseInt(m[1], 10), den: 1 };
  return null;
}

function formatFraction(num, den) {
  const g = gcd(num, den) || 1;
  num /= g;
  den /= g;
  const whole = Math.floor(num / den);
  const rem = num % den;
  if (rem === 0) return String(whole);
  if (whole === 0) return `${rem}/${den}`;
  return `${whole} ${rem}/${den}`;
}

function trimDecimal(value) {
  return String(Math.round(value * 100) / 100);
}

// Spelled-out unit words worth pluralizing correctly ("2 cup" -> "2 cups").
// Deliberately excludes abbreviations (tbsp, tsp, oz, T, t, ...), which
// recipes conventionally leave unpluralized regardless of quantity.
const PLURALIZABLE_UNITS = new Set([
  'cup', 'tablespoon', 'teaspoon', 'ounce', 'pound', 'gram', 'kilogram',
  'milliliter', 'liter', 'pinch', 'dash', 'clove', 'can', 'package',
  'stick', 'slice', 'bunch', 'sprig', 'head', 'quart', 'pint',
]);

function pluralizeUnit(word) {
  return /(ch|sh|s|x|z)$/i.test(word) ? `${word}es` : `${word}s`;
}

function singularizeUnit(word) {
  if (/(ches|shes|ses|xes|zes)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

// Scales the leading quantity (and, for a range like "2-3", both ends) in an
// ingredient or measurement string by `multiplier`, leaving the rest of the
// text (ingredient name, prep notes) untouched, and fixes up unit
// pluralization ("1 cup" x2 -> "2 cups"). Returns the input unchanged if it
// has no leading quantity to scale (e.g. "Salt to taste").
function scaleQuantityText(text, multiplier) {
  const normalized = String(text).replace(/[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => UNICODE_FRACTIONS[m] || m);

  const qtyPattern = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?/i;
  const match = normalized.match(qtyPattern);
  if (!match) return text;

  const rest = normalized.slice(match[0].length);
  const unitMatch = rest.match(/^(\s*)([A-Za-z]+)/);
  const leadingSpace = unitMatch ? unitMatch[1] : '';
  const unitWord = unitMatch ? unitMatch[2] : '';
  const useFraction = !DECIMAL_PREFERRED_UNITS.test(unitWord);

  const scaleToken = (tok) => {
    const frac = parseFractionToken(tok);
    if (!frac) return tok;
    if (useFraction) return formatFraction(frac.num * multiplier, frac.den);
    return trimDecimal((frac.num / frac.den) * multiplier);
  };

  let result = scaleToken(match[1]);
  const primaryFrac = parseFractionToken(match[1]);
  // Proper fractions ("1/2 cup", "3/4 teaspoon") and exactly-1 stay singular;
  // only values greater than 1 take the plural ("1 1/2 cups", "2 cups").
  const isPlural = primaryFrac ? (primaryFrac.num * multiplier) / primaryFrac.den > 1 : true;

  if (match[3]) result += ` - ${scaleToken(match[3])}`;

  let scaledUnit = unitWord;
  const singularUnit = singularizeUnit(unitWord.toLowerCase());
  if (PLURALIZABLE_UNITS.has(singularUnit)) {
    scaledUnit = isPlural ? pluralizeUnit(singularUnit) : singularUnit;
  }

  const afterUnit = rest.slice(leadingSpace.length + unitWord.length);
  return result + leadingSpace + scaledUnit + afterUnit;
}
