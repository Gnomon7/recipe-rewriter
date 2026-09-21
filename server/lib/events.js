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

// A client whose underlying socket died without cleanly firing the
// request's 'close' event (a killed tab, a crashed browser, a network
// drop) would otherwise sit in `clients` forever -- write() to it either
// throws or silently fails, and every future broadcast pays for it. Catch
// and prune rather than let one dead connection degrade every ingest.
function broadcast(event) {
  for (const res of clients) {
    try {
      res.write(`data: ${event}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

module.exports = { addClient, removeClient, broadcast };
