#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const DISPLAY_ID = String(process.argv[2] || '').trim();
if (!DISPLAY_ID) {
  console.error('Usage: node backend/scripts/check-balance-by-display-id.js <display_id>');
  process.exit(1);
}

(async () => {
  const r = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.display_id, u.role,
            COALESCE(w.coin_balance, 0) AS coins,
            COALESCE(w.star_balance, 0) AS points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE CAST(u.display_id AS TEXT) = $1
     LIMIT 1`,
    [DISPLAY_ID]
  );
  if (!r.rows[0]) {
    console.log(JSON.stringify({ error: 'not found', display_id: DISPLAY_ID }, null, 2));
    await db.pool.end();
    process.exit(2);
  }
  const u = r.rows[0];
  console.log(
    JSON.stringify(
      {
        display_id: u.display_id,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
        email: u.email,
        role: u.role,
        coins: Number(u.coins),
        points: Number(u.points),
      },
      null,
      2
    )
  );
  await db.pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_) {}
  process.exit(1);
});
