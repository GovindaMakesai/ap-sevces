const fs = require('fs');
const path = require('path');
const db = require('./database');
const { buildGiftSeedRows } = require('./giftCatalogSeed');

async function seedGiftCatalog() {
  const rows = buildGiftSeedRows();
  for (const g of rows) {
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
  return rows.length;
}

async function ensureSocialProductionSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/004_social_production.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  const xferPath = path.join(__dirname, '../../database/migrations/007_coin_seller_transfers.sql');
  if (fs.existsSync(xferPath)) {
    await db.query(fs.readFileSync(xferPath, 'utf8'));
  }
  await seedGiftCatalog();
  console.log('✅ Social production schema ready (follows, gift catalog, coin sellers, moderation)');
}

module.exports = { ensureSocialProductionSchema, seedGiftCatalog };
