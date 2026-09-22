const API_BASE = '/api/recipes';

// Set by a tiny inline <script> the publish step injects into the static
// export's HTML (see scripts/publish.js). When true, there's no server to
// talk to -- fetchJson serves recipes from a pre-exported data/recipes.json
// instead, and write operations aren't available. book.js/recipe.js don't
// need to know which mode they're in; they just call fetchJson as usual.
const IS_STATIC = typeof window !== 'undefined' && window.RECIPE_BOOK_STATIC === true;
let staticRecipesCache = null;

// Live mode only: refresh this page when a recipe is captured elsewhere (the
// Chrome extension, on whatever tab you're browsing a recipe on) so an
// already-open book/dashboard/recipe tab shows the new data without you
// having to switch to it and refresh by hand. The static export has no
// server to push this from, and doesn't need it -- it's a frozen snapshot.
//
// A page can opt into a soft refresh by setting window.onRecipesChanged to
// its own re-fetch-and-render function (book.js/dashboard.js both do) --
// that re-renders in place, keeping scroll position and filter state intact
// instead of flashing through a full navigation on every single ingest,
// delete, or "mark as made" anywhere else. A page that doesn't set one
// (recipe.html) falls back to the original hard reload.
if (!IS_STATIC && typeof EventSource !== 'undefined') {
  try {
    const events = new EventSource('/api/events');
    events.onmessage = () => {
      if (typeof window.onRecipesChanged === 'function') window.onRecipesChanged();
      else window.location.reload();
    };
  } catch {
    // No SSE support -- the page still works, it just won't auto-refresh.
  }
}

async function loadStaticRecipes() {
  if (!staticRecipesCache) {
    // GitHub Pages' CDN caches this file for several minutes (Cache-Control:
    // max-age=600) -- a plain reload right after publishing can otherwise
    // still show the pre-publish snapshot. The timestamp makes each load a
    // distinct URL, so it's never served a stale cached copy.
    const res = await fetch(`data/recipes.json?v=${Date.now()}`);
    if (!res.ok) throw new Error('Could not load the shared recipe data.');
    staticRecipesCache = await res.json();
  }
  return staticRecipesCache;
}

async function fetchJson(url, options) {
  if (IS_STATIC) {
    const method = (options && options.method) || 'GET';
    if (method !== 'GET') {
      throw new Error("This is a shared, read-only copy of the recipe book — recipes can't be changed here.");
    }
    const recipes = await loadStaticRecipes();
    const match = url.match(/^\/api\/recipes(?:\/([^/]+))?$/);
    if (!match) throw new Error(`Unknown request: ${url}`);
    if (!match[1]) return recipes;
    const recipe = recipes.find((r) => r.id === decodeURIComponent(match[1]));
    if (!recipe) throw new Error('Recipe not found');
    return recipe;
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- "Made it" tracking ---------------------------------------------------
// On the live app this is the real record, stored server-side per recipe
// (recipe.madeDates). The static/shared site has no server to write to, so
// there it's a separate, private, per-visitor tracker in that browser's
// localStorage -- completely disconnected from the recipe owner's own data.
// A static export never reads localStorage back in, so this never leaks
// between visitors or back to the owner.

const STATIC_MADE_KEY = 'recipe-book-made-dates';

function readStaticMadeStore() {
  try {
    return JSON.parse(localStorage.getItem(STATIC_MADE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStaticMadeStore(store) {
  try {
    localStorage.setItem(STATIC_MADE_KEY, JSON.stringify(store));
  } catch {
    // Private browsing, storage disabled, etc. -- just won't persist.
  }
}

// Synchronous: static mode reads localStorage directly, live mode reads a
// field already present on the already-fetched recipe -- neither needs a
// network round-trip.
function getMadeDates(recipe) {
  if (IS_STATIC) return (readStaticMadeStore()[recipe.id] || []).slice().sort();
  return recipe.madeDates || [];
}

async function addMadeDate(recipeId, date) {
  const day = date || new Date().toISOString().slice(0, 10);
  if (IS_STATIC) {
    const store = readStaticMadeStore();
    const dates = new Set(store[recipeId] || []);
    dates.add(day);
    store[recipeId] = Array.from(dates).sort();
    writeStaticMadeStore(store);
    return store[recipeId];
  }
  const recipe = await fetchJson(`${API_BASE}/${encodeURIComponent(recipeId)}/made`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: day }),
  });
  return recipe.madeDates || [];
}

async function removeMadeDate(recipeId, date) {
  if (IS_STATIC) {
    const store = readStaticMadeStore();
    store[recipeId] = (store[recipeId] || []).filter((d) => d !== date);
    writeStaticMadeStore(store);
    return store[recipeId];
  }
  const recipe = await fetchJson(`${API_BASE}/${encodeURIComponent(recipeId)}/made/${encodeURIComponent(date)}`, {
    method: 'DELETE',
  });
  return recipe.madeDates || [];
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
