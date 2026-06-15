const fs = require('fs');
const path = require('path');
const db = require('./database');

const GIFT_SEED = [
  { slug: 'heart', emoji: '❤️', name: 'Heart', coin_cost: 10, category: 'gift', tier: 'small', sort_order: 1 },
  { slug: 'like', emoji: '👍', name: 'Like', coin_cost: 20, category: 'gift', tier: 'small', sort_order: 2 },
  { slug: 'flowers', emoji: '💐', name: 'Flowers', coin_cost: 50, category: 'gift', tier: 'small', sort_order: 3 },
  { slug: 'rose', emoji: '🌹', name: 'Rose', coin_cost: 100, category: 'gift', tier: 'medium', sort_order: 4 },
  { slug: 'diamond', emoji: '💎', name: 'Diamond', coin_cost: 500, category: 'new', tier: 'large', sort_order: 5 },
  { slug: 'rocket', emoji: '🚀', name: 'Rocket', coin_cost: 1000, category: 'new', tier: 'large', sort_order: 6 },
  { slug: 'car', emoji: '🚗', name: 'Luxury Car', coin_cost: 80000, category: 'privilege', tier: 'vip', sort_order: 7 },
  { slug: 'castle', emoji: '🏰', name: 'Crystal Palace', coin_cost: 2000000, category: 'privilege', tier: 'vip', sort_order: 8 },
  { slug: 'lion', emoji: '🦁', name: 'Lion King', coin_cost: 700000, category: 'privilege', tier: 'vip', sort_order: 9 },
  { slug: 'yacht', emoji: '🛥️', name: 'Yacht Voyage', coin_cost: 1500000, category: 'privilege', tier: 'vip', sort_order: 10 },
];

async function seedGiftCatalog() {
  for (const g of GIFT_SEED) {
    await db.query(
      `INSERT INTO gift_catalog (slug, emoji, name, coin_cost, category, tier, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET
         emoji = EXCLUDED.emoji,
         name = EXCLUDED.name,
         coin_cost = EXCLUDED.coin_cost,
         category = EXCLUDED.category,
         tier = EXCLUDED.tier,
         sort_order = EXCLUDED.sort_order`,
      [g.slug, g.emoji, g.name, g.coin_cost, g.category, g.tier, g.sort_order]
    );
  }
}

async function ensureSocialProductionSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/004_social_production.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  await seedGiftCatalog();
  console.log('✅ Social production schema ready (follows, gift catalog, coin sellers, moderation)');
}

module.exports = { ensureSocialProductionSchema };
