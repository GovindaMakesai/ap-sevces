#!/usr/bin/env node
/** Re-seed gift_catalog from frontend/live-emoji-data.js */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const { seedGiftCatalog } = require('../config/ensureSocialProductionSchema');

(async () => {
  const n = await seedGiftCatalog();
  const r = await db.query(
    `SELECT slug, name, coin_cost FROM gift_catalog WHERE coin_cost = 200 ORDER BY name`
  );
  console.log(JSON.stringify({ seeded: n, gifts_200: r.rows }, null, 2));
  await db.pool.end();
})().catch(async (e) => {
  console.error(e);
  try { await db.pool.end(); } catch (_e) {}
  process.exit(1);
});
