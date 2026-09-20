const config = require('../../config');
const { rewriteClaude } = require('./claude');
const { rewriteLocal } = require('./local');

async function rewriteInstructions(recipe) {
  if (config.rewriteEngine === 'local') {
    return rewriteLocal(recipe);
  }
  return rewriteClaude(recipe);
}

module.exports = { rewriteInstructions };
