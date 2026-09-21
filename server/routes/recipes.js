const express = require('express');
const store = require('../lib/store');
const { cleanText, cleanList } = require('../lib/normalize');
const { rewriteInstructions } = require('../lib/rewriter');
const { deriveIngredientTags, mergeTags } = require('../lib/tags');

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

    const tags = mergeTags(sourceTags, deriveIngredientTags(ingredients));

    const recipe = store.saveRecipe({
      title,
      sourceUrl,
      image,
      ingredients,
      instructionsOriginal,
      instructionsRewritten,
      rewriteError,
      tags,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json(recipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save recipe.' });
  }
});

module.exports = router;
