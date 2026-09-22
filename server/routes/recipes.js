const express = require('express');
const store = require('../lib/store');
const { cleanText, cleanList } = require('../lib/normalize');
const { rewriteInstructions } = require('../lib/rewriter');
const { deriveIngredientTags, mergeTags } = require('../lib/tags');
const { broadcast } = require('../lib/events');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(store.listRecipes());
});

router.get('/:id', (req, res) => {
  const recipe = store.getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(recipe);
});

router.delete('/:id', (req, res) => {
  const ok = store.deleteRecipe(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Recipe not found' });
  res.status(204).end();
});

router.post('/ingest', async (req, res) => {
  try {
    const body = req.body || {};
    const title = cleanText(body.title) || 'Untitled recipe';
    const ingredients = cleanList(body.ingredients);
    const instructionsOriginal = cleanList(body.instructions);
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : '';
    const image = typeof body.image === 'string' ? body.image : '';
    const sourceTags = cleanList(body.tags);
    const calories = Number.isFinite(body.calories) ? Math.round(body.calories) : null;

    if (!ingredients.length || !instructionsOriginal.length) {
      return res.status(422).json({
        error: 'Could not find ingredients and instructions on this page. This site may not use standard recipe markup.',
      });
    }

    let instructionsRewritten = instructionsOriginal;
    let rewriteError = null;
    try {
      const result = await rewriteInstructions({ title, ingredients, instructions: instructionsOriginal });
      instructionsRewritten = result.instructions;
    } catch (err) {
      rewriteError = err.message;
    }

    const tags = mergeTags([sourceTags, deriveIngredientTags(ingredients)]);

    const recipe = store.saveRecipe({
      title,
      sourceUrl,
      image,
      ingredients,
      instructionsOriginal,
      instructionsRewritten,
      rewriteError,
      tags,
      calories,
      madeDates: [],
      createdAt: new Date().toISOString(),
    });

    broadcast('recipes-changed');
    res.status(201).json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save recipe.' });
  }
});

// Records a date this recipe was cooked. Body: { date? } (defaults to today,
// ISO yyyy-mm-dd). Static/read-only sites can't reach this endpoint at all
// (no server) -- see public/app.js's localStorage-backed equivalent there.
router.post('/:id/made', (req, res) => {
  const recipe = store.getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const date = typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
    ? req.body.date
    : new Date().toISOString().slice(0, 10);

  const madeDates = Array.from(new Set([...(recipe.madeDates || []), date])).sort();
  const updated = store.saveRecipe({ ...recipe, madeDates });
  res.json(updated);
});

router.delete('/:id/made/:date', (req, res) => {
  const recipe = store.getRecipe(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const madeDates = (recipe.madeDates || []).filter((d) => d !== req.params.date);
  const updated = store.saveRecipe({ ...recipe, madeDates });
  res.json(updated);
});

module.exports = router;
