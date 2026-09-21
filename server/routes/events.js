const express = require('express');
const { addClient, removeClient } = require('../lib/events');

const router = express.Router();

router.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  addClient(res);
  req.on('close', () => removeClient(res));
});

module.exports = router;
