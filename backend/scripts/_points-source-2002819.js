#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

(async () => {
  const DISPLAY = '2002819';
  const u = (
    await db.query(
      `SELECT u.id, COALESCE(w.star_balance,0)::bigint AS points
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id
       WHERE CAST(u.display_id AS TEXT) = $1`,
      [DISPLAY]
    )
  ).rows[0];

  const bySource = await db.query(
    `SELECT COALESCE(reference_type, type, 'unknown') AS source,
            type,
            COUNT(*)::int AS n,
            COALESCE(SUM(amount::numeric), 0)::text AS net,
            COALESCE(SUM(amount::numeric) FILTER (WHERE amount::numeric > 0), 0)::text AS credits,
            COALESCE(SUM(amount::numeric) FILTER (WHERE amount::numeric < 0), 0)::text AS debits
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'star'
     GROUP BY 1, 2
     ORDER BY ABS(SUM(amount::numeric)) DESC`,
    [u.id]
  );

  const admin = await db.query(
    `SELECT amount::numeric AS amount, type, reference_type, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'star'
       AND (type ILIKE '%admin%' OR reference_type ILIKE '%admin%')
     ORDER BY created_at`,
    [u.id]
  );

  const net = await db.query(
    `SELECT COALESCE(SUM(amount::numeric),0)::text AS ledger_net
     FROM wallet_transactions WHERE user_id = $1 AND currency_type = 'star'`,
    [u.id]
  );

  console.log(
    JSON.stringify(
      {
        display_id: DISPLAY,
        wallet_points_now: Number(u.points),
        ledger_net: net.rows[0].ledger_net,
        by_source: bySource.rows,
        admin_star_rows: admin.rows,
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
