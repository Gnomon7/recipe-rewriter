require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5175,
  rewriteEngine: (process.env.REWRITE_ENGINE || 'claude').toLowerCase(),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
};
