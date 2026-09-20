const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data', 'recipes');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function slugify(title) {
  const slug = String(title || 'recipe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  return slug || 'recipe';
}

function filePathFor(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

function listRecipes() {
  ensureDir();
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getRecipe(id) {
  ensureDir();
  const file = filePathFor(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveRecipe(recipe) {
  ensureDir();
  const id = recipe.id || `${slugify(recipe.title)}-${crypto.randomUUID().slice(0, 8)}`;
  const toSave = { ...recipe, id };
  fs.writeFileSync(filePathFor(id), JSON.stringify(toSave, null, 2));
  return toSave;
}

function deleteRecipe(id) {
  const file = filePathFor(id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    return true;
  }
  return false;
}

module.exports = { listRecipes, getRecipe, saveRecipe, deleteRecipe };
