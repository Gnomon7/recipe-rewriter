// Exports the currently-saved recipes into docs/ as a static, read-only copy
// of the recipe book, suitable for GitHub Pages. Run with: npm run publish
//
// docs/ is regenerated from scratch each run. It reuses the same
// html/css/js as the live app unchanged -- only a `window.RECIPE_BOOK_STATIC`
// flag differs, which app.js uses to read from data/recipes.json instead of
// hitting a live server (see public/app.js).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RECIPES_DIR = path.join(ROOT, 'server', 'data', 'recipes');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DOCS_DIR = path.join(ROOT, 'docs');

const STATIC_ASSETS = [
  'index.html', 'recipe.html', 'dashboard.html', 'styles.css', 'app.js',
  'units.js', 'stats.js', 'book.js', 'recipe.js', 'dashboard.js',
];

function loadRecipes() {
  if (!fs.existsSync(RECIPES_DIR)) return [];
  return fs
    .readdirSync(RECIPES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RECIPES_DIR, f), 'utf8')))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function rimraf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Regenerates docs/ from the current recipe data. Returns the recipe count
// so callers (the CLI run below, or the in-app "Refresh Live Site" button's
// server route) can report what happened without re-reading the directory.
function publish() {
  const recipes = loadRecipes();

  rimraf(DOCS_DIR);
  fs.mkdirSync(path.join(DOCS_DIR, 'data'), { recursive: true });

  for (const asset of STATIC_ASSETS) {
    const src = path.join(PUBLIC_DIR, asset);
    let content = fs.readFileSync(src, 'utf8');
    if (asset.endsWith('.html')) {
      content = content.replace('window.RECIPE_BOOK_STATIC = false;', 'window.RECIPE_BOOK_STATIC = true;');
      // The "env-local" body class drives the grey/blue admin look + badge
      // that mark the editable local app -- stripped here so the published
      // read-only site keeps its own (green) look instead.
      content = content.replace(' class="env-local"', '');
    }
    fs.writeFileSync(path.join(DOCS_DIR, asset), content);
  }

  fs.writeFileSync(path.join(DOCS_DIR, 'data', 'recipes.json'), JSON.stringify(recipes, null, 2));

  // Prevents GitHub Pages' default Jekyll processing from touching the site.
  fs.writeFileSync(path.join(DOCS_DIR, '.nojekyll'), '');

  return { count: recipes.length };
}

module.exports = { publish, DOCS_DIR, ROOT };

if (require.main === module) {
  const { count } = publish();
  console.log(`Published ${count} recipe(s) to docs/.`);
  console.log('Commit and push docs/, then enable GitHub Pages (Settings -> Pages -> Deploy from a branch -> main / docs) if you haven\'t already.');
}
