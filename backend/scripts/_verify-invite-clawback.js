#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
(async () => {
  const u = await db.query(
    `SELECT u.display_id, COALESCE(w.star_balance,0) AS points, COALESCE(w.coin_balance,0) AS coins
     FROM users u LEFT JOIN wallets w ON w.user_id = u.id
     WHERE CAST(u.display_id AS TEXT) = '2002819'`
  );
  console.log('user', u.rows[0]);
  const w = await db.query(
    `SELECT status, amount, amount_inr, created_at
     FROM withdrawals
     WHERE user_id = (SELECT id FROM users WHERE CAST(display_id AS TEXT) = '2002819')
     ORDER BY created_at DESC LIMIT 5`
  );
  console.log('withdrawals', w.rows);
  const c = await db.query(
    `SELECT type, amount, created_at FROM wallet_transactions
     WHERE user_id = (SELECT id FROM users WHERE CAST(display_id AS TEXT) = '2002819')
       AND type = 'invite_points_clawback'`
  );
  console.log('clawbacks', c.rows);
  const total = await db.query(
    `SELECT COUNT(DISTINCT user_id)::int AS users,
            COALESCE(SUM(ABS(amount::numeric)),0)::text AS points_clawed
     FROM wallet_transactions
     WHERE type = 'invite_points_clawback'`
  );
  console.log('platform_clawback', total.rows[0]);
  await db.pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
