const ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾',
};

function stripHtml(input) {
  if (!input) return '';
  return String(input).replace(/<[^>]*>/g, ' ');
}

function decodeEntities(input) {
  if (!input) return '';
  return String(input).replace(/&(#(\d+)|[a-zA-Z0-9]+);/g, (match, entity, numeric) => {
    if (numeric) return String.fromCharCode(parseInt(numeric, 10));
    const key = entity.toLowerCase();
    return ENTITY_MAP[key] !== undefined ? ENTITY_MAP[key] : match;
  });
}

function cleanText(input) {
  return decodeEntities(stripHtml(input)).replace(/\s+/g, ' ').trim();
}

function cleanList(list) {
  return (Array.isArray(list) ? list : []).map(cleanText).filter(Boolean);
}

module.exports = { stripHtml, decodeEntities, cleanText, cleanList };
