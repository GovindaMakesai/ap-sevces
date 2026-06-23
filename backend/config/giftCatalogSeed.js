/**
 * Build gift catalog rows from frontend/live-emoji-data.js (single source of truth).
 */
const fs = require('fs');
const path = require('path');

function slugify(name) {
  return String(name || 'gift')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

function loadCatalogFromFrontend() {
  const filePath = path.join(__dirname, '../../frontend/live-emoji-data.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const match = code.match(/\(function \(g\) \{([\s\S]*)\}\)\(typeof window/);
  if (!match) throw new Error('Could not parse live-emoji-data.js');
  const g = {};
  // eslint-disable-next-line no-new-func
  new Function('g', match[1])(g);
  return g.AP_LIVE_EMOJI?.GIFT_CATALOG || {};
}

function buildGiftSeedRows() {
  const catalog = loadCatalogFromFrontend();
  const seen = new Set();
  const rows = [];
  let sort = 1;
  for (const [category, items] of Object.entries(catalog)) {
    for (const item of items || []) {
      const slug = `${slugify(item.name)}_${item.cost}`;
      const key = `${slug}:${item.cost}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        slug,
        emoji: item.emoji,
        name: item.name,
        coin_cost: Number(item.cost) || 0,
        category,
        tier:
          Number(item.cost) >= 500000
            ? 'vip'
            : Number(item.cost) >= 5000
              ? 'large'
              : Number(item.cost) >= 100
                ? 'medium'
                : 'small',
        sort_order: sort++,
      });
    }
  }
  return rows;
}

module.exports = { buildGiftSeedRows, slugify };
