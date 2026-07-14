/**
 * Ensure live wallet settings use 100,000 points = $10 for withdrawals.
 * Does not change coins_per_inr (recharge rate).
 */
require('dotenv').config();
const db = require('../config/database');

(async () => {
  const cur = await db.query(`SELECT value FROM platform_settings WHERE key = 'wallet' LIMIT 1`);
  const prev = cur.rows[0]?.value || {};
  const next = {
    ...prev,
    min_withdrawal_usd: 10,
    withdrawal_points_per_usd: 10000,
    min_withdrawal_coins: 100000,
    inr_per_usd: 94,
    coins_per_inr: Number(prev.coins_per_inr) || 10,
  };
  await db.query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('wallet', $1::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [JSON.stringify(next)]
  );
  console.log('wallet settings updated', next);
  await db.pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
