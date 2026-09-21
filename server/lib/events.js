// Tiny in-memory Server-Sent-Events broadcaster. Lets any open recipe-book
// page know "the data changed, refresh yourself" without the Chrome
// extension having to reach into browser tabs at all -- the page just
// listens for its own reload signal, same as any other live-update site.
const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function broadcast(event) {
  for (const res of clients) {
    res.write(`data: ${event}\n\n`);
  }
}

module.exports = { addClient, removeClient, broadcast };
