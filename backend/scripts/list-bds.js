#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function main() {
  const bds = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.display_id,
            p.code AS promo_code, p.active AS promo_active, b.status AS bd_status
     FROM users u
     LEFT JOIN bd_profiles b ON b.user_id = u.id
     LEFT JOIN bd_promo_codes p ON p.bd_user_id = u.id AND p.active = TRUE
     WHERE u.role = 'bdm' OR b.user_id IS NOT NULL
     ORDER BY u.email
     LIMIT 30`
  );
  console.log(JSON.stringify({ count: bds.rows.length, bds: bds.rows }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
