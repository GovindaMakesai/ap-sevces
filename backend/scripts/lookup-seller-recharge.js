const db = require('../config/database');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node backend/scripts/lookup-seller-recharge.js <email|userId|rechargeId>');
  process.exit(1);
}

async function main() {
  const isUuid = /^[0-9a-f-]{36}$/i.test(arg);
  const [profile, recharges, wallet] = await Promise.all([
    db.query(
      isUuid
        ? `SELECT p.*, u.email, u.first_name, u.last_name FROM coin_seller_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`
        : `SELECT p.*, u.email, u.first_name, u.last_name FROM coin_seller_profiles p JOIN users u ON u.id = p.user_id WHERE u.email ILIKE $1`,
      [arg]
    ),
    db.query(
      isUuid
        ? `SELECT sr.*, u.email FROM coin_seller_recharges sr JOIN users u ON u.id = sr.seller_id
           WHERE sr.seller_id = $1 OR sr.id = $1 ORDER BY sr.created_at DESC LIMIT 20`
        : `SELECT sr.*, u.email FROM coin_seller_recharges sr JOIN users u ON u.id = sr.seller_id
           WHERE u.email ILIKE $1 ORDER BY sr.created_at DESC LIMIT 20`,
      [arg]
    ),
    db.query(
      isUuid
        ? `SELECT w.coin_balance, w.star_balance FROM wallets w WHERE w.user_id = $1`
        : `SELECT w.coin_balance, w.star_balance FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.email ILIKE $1`,
      [arg]
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        query: arg,
        seller_profile: profile.rows[0] || null,
        wallet: wallet.rows[0] || null,
        seller_recharges: recharges.rows,
        sellable_estimate:
          Number(profile.rows[0]?.inventory_coins || 0) + Number(wallet.rows[0]?.coin_balance || 0),
      },
      null,
      2
    )
  );

  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
