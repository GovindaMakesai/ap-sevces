const db = require('../config/database');
const walletService = require('./walletService');

async function getProfile(userId) {
  const res = await db.query(`SELECT * FROM coin_seller_profiles WHERE user_id = $1`, [userId]);
  return res.rows[0] || null;
}

async function listActiveSellers(limit = 30) {
  const res = await db.query(
    `SELECT p.*, u.first_name, u.last_name, u.profile_pic
     FROM coin_seller_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.is_active = TRUE AND p.inventory_coins > 0
     ORDER BY p.inventory_coins DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function upsertProfile(userId, { displayName, inventoryCoins, isActive = true }) {
  const res = await db.query(
    `INSERT INTO coin_seller_profiles (user_id, display_name, inventory_coins, is_active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, coin_seller_profiles.display_name),
       inventory_coins = COALESCE(EXCLUDED.inventory_coins, coin_seller_profiles.inventory_coins),
       is_active = COALESCE(EXCLUDED.is_active, coin_seller_profiles.is_active),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, displayName || 'Coin Seller', inventoryCoins ?? 0, isActive]
  );
  return res.rows[0];
}

/** Seller transfers coins from inventory to buyer wallet (admin pre-funds inventory). */
async function sellCoins({ sellerId, buyerId, coins, amountInr, referenceCode }) {
  const amount = parseInt(coins, 10);
  if (!amount || amount <= 0) throw new Error('Invalid coin amount');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const sellerRes = await client.query(
      `SELECT * FROM coin_seller_profiles WHERE user_id = $1 AND is_active = TRUE FOR UPDATE`,
      [sellerId]
    );
    const seller = sellerRes.rows[0];
    if (!seller) throw new Error('Seller profile not found or inactive');
    if (Number(seller.inventory_coins) < amount) throw new Error('Seller inventory insufficient');

    await client.query(
      `UPDATE coin_seller_profiles
       SET inventory_coins = inventory_coins - $2, total_sold = total_sold + $2, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [sellerId, amount]
    );

    await walletService.creditCoins(buyerId, amount, {
      type: 'coin_seller_purchase',
      reference_type: 'coin_seller_order',
      metadata: { sellerId, referenceCode },
    }, client);

    const orderRes = await client.query(
      `INSERT INTO coin_seller_orders (seller_id, buyer_id, coins, amount_inr, reference_code, status)
       VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING *`,
      [sellerId, buyerId, amount, amountInr || null, referenceCode || null]
    );

    await client.query('COMMIT');
    return orderRes.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  getProfile,
  listActiveSellers,
  upsertProfile,
  sellCoins,
};
