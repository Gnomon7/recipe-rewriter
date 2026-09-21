const path = require('path');
const express = require('express');
const config = require('./config');
const recipesRouter = require('./routes/recipes');
const publishRouter = require('./routes/publish');
const eventsRouter = require('./routes/events');

const app = express();

app.use(express.json({ limit: '1mb' }));

// Only the browser extension (chrome-extension:// origin) needs CORS to reach
// this API cross-origin; the web UI itself is served same-origin below.
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin.startsWith('chrome-extension://')) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/recipes', recipesRouter);
app.use('/api/publish', publishRouter);
app.use('/api/events', eventsRouter);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(config.port, () => {
  console.log(`Recipe book running at http://localhost:${config.port}`);
  console.log(`Rewrite engine: ${config.rewriteEngine}`);
  if (config.rewriteEngine === 'claude' && !config.anthropicApiKey) {
    console.warn('Warning: REWRITE_ENGINE=claude but ANTHROPIC_API_KEY is not set. Set it in .env, or switch to REWRITE_ENGINE=local.');
  }
});
