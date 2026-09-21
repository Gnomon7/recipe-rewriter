const express = require('express');
const { execFileSync } = require('child_process');
const { publish, ROOT } = require('../../scripts/publish');

const router = express.Router();

// No request body is ever passed into these -- every argument is a fixed
// literal, so there's no injection surface from the request.
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// Publishes current recipes to docs/ and pushes them live. Takes no input
// from the request; every git/npm argument below is a fixed literal.
router.post('/', (req, res) => {
  try {
    const branch = git(['branch', '--show-current']);
    if (branch !== 'main') {
      return res.status(409).json({
        error: `You're on branch "${branch}", not main. The live site only serves from main -- switch to main (or merge this branch) before publishing.`,
      });
    }

    const { count } = publish();

    const changed = git(['status', '--porcelain', '--', 'docs']);
    if (!changed) {
      return res.json({ published: false, count, message: 'Already up to date -- nothing new to publish.' });
    }

    git(['add', 'docs']);
    git(['commit', '-m', `Publish ${count} recipe(s) via in-app refresh`]);
    git(['push']);

    res.json({ published: true, count, message: `Published ${count} recipe(s) to the live site.` });
  } catch (err) {
    console.error(err);
    const detail = err.stderr ? err.stderr.toString().trim() : err.message;
    res.status(500).json({ error: `Publish failed: ${detail}` });
  }
});

module.exports = router;
