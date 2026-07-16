#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const DISPLAY_ID = String(process.argv[2] || '').trim();
if (!DISPLAY_ID) {
  console.error('Usage: node backend/scripts/gift-stats-by-display-id.js <display_id>');
  process.exit(1);
}

(async () => {
  const userRes = await db.query(
    `SELECT u.id, u.display_id, u.email, u.first_name, u.last_name,
            COALESCE(w.coin_balance, 0) AS coins,
            COALESCE(w.star_balance, 0) AS points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE CAST(u.display_id AS TEXT) = $1
     LIMIT 1`,
    [DISPLAY_ID]
  );
  const u = userRes.rows[0];
  if (!u) {
    console.log(JSON.stringify({ error: 'not found', display_id: DISPLAY_ID }, null, 2));
    await db.pool.end();
    process.exit(2);
  }

  const sent = await db.query(
    `SELECT COUNT(*)::int AS gift_count,
            COALESCE(SUM(coin_amount), 0)::bigint AS coins_spent,
            COALESCE(SUM(COALESCE(qty, 1)), 0)::bigint AS units
     FROM gift_transactions
     WHERE sender_id = $1`,
    [u.id]
  ).catch(async () =>
    db.query(
      `SELECT COUNT(*)::int AS gift_count,
              COALESCE(SUM(coin_amount), 0)::bigint AS coins_spent
       FROM gift_transactions
       WHERE sender_id = $1`,
      [u.id]
    )
  );

  const recv = await db.query(
    `SELECT COUNT(*)::int AS gift_count,
            COALESCE(SUM(coin_amount), 0)::bigint AS coins_value,
            COALESCE(SUM(creator_amount), 0)::bigint AS points_earned
     FROM gift_transactions
     WHERE receiver_id = $1`,
    [u.id]
  );

  const topSent = await db.query(
    `SELECT gift_type, COUNT(*)::int AS times, COALESCE(SUM(coin_amount),0)::bigint AS coins
     FROM gift_transactions
     WHERE sender_id = $1
     GROUP BY gift_type
     ORDER BY coins DESC
     LIMIT 10`,
    [u.id]
  );

  const topRecv = await db.query(
    `SELECT gift_type, COUNT(*)::int AS times, COALESCE(SUM(coin_amount),0)::bigint AS coins,
            COALESCE(SUM(creator_amount),0)::bigint AS points
     FROM gift_transactions
     WHERE receiver_id = $1
     GROUP BY gift_type
     ORDER BY coins DESC
     LIMIT 10`,
    [u.id]
  );

  console.log(
    JSON.stringify(
      {
        user: {
          display_id: u.display_id,
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          email: u.email,
          wallet_coins: Number(u.coins),
          wallet_points: Number(u.points),
        },
        sent: {
          gifts: Number(sent.rows[0].gift_count || 0),
          coins_spent: Number(sent.rows[0].coins_spent || 0),
        },
        received: {
          gifts: Number(recv.rows[0].gift_count || 0),
          coins_value: Number(recv.rows[0].coins_value || 0),
          points_earned: Number(recv.rows[0].points_earned || 0),
        },
        top_sent: topSent.rows,
        top_received: topRecv.rows,
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
