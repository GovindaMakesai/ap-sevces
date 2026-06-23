/**
 * Seed gift_catalog from frontend/live-emoji-data.js
 * Usage: node scripts/seed-gift-catalog.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const { seedGiftCatalog } = require('../config/ensureSocialProductionSchema');
  const n = await seedGiftCatalog();
  console.log(`Seeded ${n} gifts into gift_catalog`);
  const db = require('../config/database');
  await db.pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
