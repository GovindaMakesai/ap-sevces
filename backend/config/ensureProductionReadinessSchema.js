const fs = require('fs');
const path = require('path');
const db = require('./database');

const COIN_PACKAGES = [
  { slug: 'starter', name: 'Starter Pack', coins: 7000, price_inr: 99, bonus_coins: 0, sort_order: 1 },
  { slug: 'popular', name: 'Popular Pack', coins: 21000, price_inr: 299, bonus_coins: 1000, sort_order: 2 },
  { slug: 'value', name: 'Value Pack', coins: 70000, price_inr: 999, bonus_coins: 5000, sort_order: 3 },
  { slug: 'mega', name: 'Mega Pack', coins: 210000, price_inr: 2999, bonus_coins: 20000, sort_order: 4 },
];

async function seedCoinPackages() {
  for (const p of COIN_PACKAGES) {
    await db.query(
      `INSERT INTO coin_packages (slug, name, coins, price_inr, bonus_coins, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, coins = EXCLUDED.coins, price_inr = EXCLUDED.price_inr,
         bonus_coins = EXCLUDED.bonus_coins, sort_order = EXCLUDED.sort_order`,
      [p.slug, p.name, p.coins, p.price_inr, p.bonus_coins, p.sort_order]
    );
  }
}

async function ensureProductionReadinessSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/006_production_readiness.sql');
  await db.query(fs.readFileSync(sqlPath, 'utf8'));
  await seedCoinPackages();
  console.log('✅ Production readiness schema ready');
}

module.exports = { ensureProductionReadinessSchema };
