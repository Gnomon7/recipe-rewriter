// Bulk-imports recipes from a markdown bookmarks file (lines shaped like
// "1. [title](url)") into the local recipe book. Fetches each URL directly
// (no browser needed) and looks for the same schema.org Recipe JSON-LD the
// Chrome extension reads -- pages without it (most non-recipe bookmarks:
// videos, forums, product pages, docs) are skipped, not treated as errors.
//
// Usage: node scripts/import-bookmarks.js <path-to-bookmarks.md> [port]

const fs = require('fs');

const LINK_PATTERN = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

function parseBookmarks(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const seen = new Set();
  const links = [];
  let match;
  while ((match = LINK_PATTERN.exec(text))) {
    const [, title, url] = match;
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ title: title.trim(), url });
  }
  return links;
}

// --- Recipe extraction -----------------------------------------------
// Ported from extension/content.js's pure-data helpers. These only ever
// operate on already-parsed JSON-LD objects, never the DOM, so they work
// identically here on server-fetched HTML as they do in the browser.

function findRecipeNode(node) {
  if (!node || typeof node !== 'object') return null;
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes('Recipe')) return node;
  if (Array.isArray(node['@graph'])) {
    for (const item of node['@graph']) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
  }
  return null;
}

function imageUrlFrom(image) {
  if (!image) return '';
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return imageUrlFrom(image[0]);
  if (typeof image === 'object') return image.url || '';
  return '';
}

function flattenInstructions(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (typeof value === 'object') {
    if (value.itemListElement) return flattenInstructions(value.itemListElement);
    if (value.text) return [value.text];
    if (value.name) return [value.name];
  }
  return [];
}

function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toStringArray);
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

const DIET_LABELS = {
  diabeticdiet: 'Diabetic', glutenfreediet: 'Gluten-Free', halaldiet: 'Halal',
  hindudiet: 'Hindu', kosherdiet: 'Kosher', lowcaloriediet: 'Low-Calorie',
  lowfatdiet: 'Low-Fat', lowlactosediet: 'Low-Lactose', lowsodiumdiet: 'Low-Sodium',
  paleodiet: 'Paleo', vegandiet: 'Vegan', vegetariandiet: 'Vegetarian',
};

function dietTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(dietTags);
  let raw = value;
  if (typeof value === 'object') raw = value['@id'] || value.name || '';
  if (typeof raw !== 'string') return [];
  const slug = raw.split('/').pop().toLowerCase();
  const label = DIET_LABELS[slug];
  return label ? [label] : [];
}

function tagsFrom(recipe) {
  const tags = [
    ...toStringArray(recipe.recipeCategory),
    ...toStringArray(recipe.recipeCuisine),
    ...toStringArray(recipe.keywords),
    ...dietTags(recipe.suitableForDiet),
  ];
  return Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
}

function caloriesFrom(recipe) {
  const value = recipe.nutrition && recipe.nutrition.calories;
  if (!value) return null;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  return match ? Math.round(parseFloat(match[1])) : null;
}

// Extracts every JSON-LD <script> block from raw HTML without a full HTML
// parser -- good enough for well-formed pages, which covers the vast
// majority of recipe sites (they want this data readable by Google).
function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      // Malformed JSON-LD on this one block -- not fatal for the page.
    }
  }
  return blocks;
}

function extractRecipeFromHtml(html) {
  for (const data of extractJsonLdBlocks(html)) {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      const recipe = findRecipeNode(item);
      if (recipe) {
        return {
          title: recipe.name || '',
          image: imageUrlFrom(recipe.image),
          ingredients: recipe.recipeIngredient || recipe.ingredients || [],
          instructions: flattenInstructions(recipe.recipeInstructions),
          tags: tagsFrom(recipe),
          calories: caloriesFrom(recipe),
        };
      }
    }
  }
  return null;
}

// --- Fetch + ingest loop -------------------------------------------------

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { html: await res.text() };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-bookmarks.js <path-to-bookmarks.md> [port]');
    process.exit(1);
  }
  const port = process.argv[3] || process.env.PORT || 5757;
  const apiBase = `http://localhost:${port}/api/recipes`;

  const links = parseBookmarks(filePath);
  console.log(`Found ${links.length} unique link(s) in ${filePath}.\n`);

  const results = { imported: [], skippedNoRecipe: [], skippedDuplicate: [], failed: [] };

  let existingTitles = new Set();
  try {
    const res = await fetch(apiBase);
    const existing = await res.json();
    existingTitles = new Set(existing.map((r) => r.title.toLowerCase()));
  } catch {
    console.error(`Could not reach the local server at ${apiBase} -- is it running? (npm start)`);
    process.exit(1);
  }

  for (const [i, { title, url }] of links.entries()) {
    process.stdout.write(`[${i + 1}/${links.length}] ${title || url} ... `);
    const { html, error } = await fetchHtml(url);
    if (error) {
      console.log(`fetch failed (${error})`);
      results.failed.push({ title, url, reason: error });
      await sleep(150);
      continue;
    }
    const recipe = extractRecipeFromHtml(html);
    if (!recipe || !recipe.ingredients.length || !recipe.instructions.length) {
      console.log('no recipe data found');
      results.skippedNoRecipe.push({ title, url });
      await sleep(150);
      continue;
    }
    const finalTitle = recipe.title || title;
    if (existingTitles.has(finalTitle.toLowerCase())) {
      console.log('already in book, skipped');
      results.skippedDuplicate.push({ title: finalTitle, url });
      await sleep(150);
      continue;
    }
    try {
      const ingestRes = await fetch(`${apiBase}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recipe, sourceUrl: url }),
      });
      if (!ingestRes.ok) {
        const body = await ingestRes.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${ingestRes.status}`);
      }
      const saved = await ingestRes.json();
      existingTitles.add(saved.title.toLowerCase());
      console.log(`imported: "${saved.title}"`);
      results.imported.push({ title: saved.title, url });
    } catch (err) {
      console.log(`ingest failed (${err.message})`);
      results.failed.push({ title, url, reason: err.message });
    }
    await sleep(150);
  }

  console.log('\n--- Summary ---');
  console.log(`Imported: ${results.imported.length}`);
  console.log(`Skipped (no recipe data found): ${results.skippedNoRecipe.length}`);
  console.log(`Skipped (already in book): ${results.skippedDuplicate.length}`);
  console.log(`Failed: ${results.failed.length}`);
  if (results.failed.length) {
    console.log('\nFailures:');
    for (const f of results.failed) console.log(`  - ${f.title || f.url}: ${f.reason}`);
  }
}

main();
