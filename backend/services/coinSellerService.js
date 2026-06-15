const db = require('../config/database');
const walletService = require('./walletService');
const auditLogService = require('./auditLogService');

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

/** Buyer creates pending order — no coins credited until approval. */
async function createPendingOrder({ sellerId, buyerId, coins, amountInr, referenceCode }) {
  const amount = parseInt(coins, 10);
  if (!amount || amount <= 0) throw new Error('Invalid coin amount');
  if (String(sellerId) === String(buyerId)) throw new Error('Cannot buy from yourself');

  const seller = await getProfile(sellerId);
  if (!seller || !seller.is_active) throw new Error('Seller not available');
  if (Number(seller.inventory_coins) < amount) throw new Error('Seller inventory insufficient');

  const ref = referenceCode || `CS${Date.now().toString(36).toUpperCase()}`;
  const res = await db.query(
    `INSERT INTO coin_seller_orders (seller_id, buyer_id, coins, amount_inr, reference_code, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [sellerId, buyerId, amount, amountInr || null, ref]
  );
  await auditLogService.log(buyerId, 'coin_seller.order_created', {
    entity_type: 'coin_seller_order',
    entity_id: res.rows[0].id,
    metadata: { sellerId, coins: amount, referenceCode: ref },
  });
  return res.rows[0];
}

async function attachPaymentProof(orderId, buyerId, fileAssetId) {
  const res = await db.query(
    `UPDATE coin_seller_orders SET payment_proof_asset_id = $3, status = 'proof_submitted'
     WHERE id = $1 AND buyer_id = $2 AND status IN ('pending', 'proof_submitted') RETURNING *`,
    [orderId, buyerId, fileAssetId]
  );
  if (!res.rows[0]) throw new Error('Order not found or not awaiting proof');
  await auditLogService.log(buyerId, 'coin_seller.proof_uploaded', {
    entity_type: 'coin_seller_order',
    entity_id: orderId,
    metadata: { fileAssetId },
  });
  return res.rows[0];
}

async function completeOrder(orderId, approverId, { role = 'seller', rejectionReason } = {}) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query(
      `SELECT * FROM coin_seller_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) throw new Error('Order not found');

    if (rejectionReason) {
      const upd = await client.query(
        `UPDATE coin_seller_orders SET status = 'rejected', rejection_reason = $2 WHERE id = $1 RETURNING *`,
        [orderId, rejectionReason]
      );
      await client.query('COMMIT');
      await auditLogService.log(approverId, 'coin_seller.order_rejected', {
        entity_type: 'coin_seller_order',
        entity_id: orderId,
        metadata: { role, rejectionReason },
      });
      return upd.rows[0];
    }

    if (!['proof_submitted', 'pending'].includes(order.status)) {
      throw new Error(`Order cannot be approved in status: ${order.status}`);
    }
    if (role === 'seller' && String(order.seller_id) !== String(approverId)) {
      throw new Error('Only the seller can approve this order');
    }

    const sellerRes = await client.query(
      `SELECT * FROM coin_seller_profiles WHERE user_id = $1 AND is_active = TRUE FOR UPDATE`,
      [order.seller_id]
    );
    const seller = sellerRes.rows[0];
    if (!seller) throw new Error('Seller profile not found');
    if (Number(seller.inventory_coins) < Number(order.coins)) {
      throw new Error('Seller inventory insufficient');
    }

    await client.query(
      `UPDATE coin_seller_profiles
       SET inventory_coins = inventory_coins - $2, total_sold = total_sold + $2, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [order.seller_id, order.coins]
    );

    await walletService.creditCoins(order.buyer_id, order.coins, {
      type: 'coin_seller_purchase',
      reference_type: 'coin_seller_order',
      reference_id: order.id,
      metadata: { sellerId: order.seller_id, referenceCode: order.reference_code },
    }, client);

    const statusFields =
      role === 'admin'
        ? `status = 'completed', admin_approved_by = $2, admin_approved_at = CURRENT_TIMESTAMP, seller_approved_at = COALESCE(seller_approved_at, CURRENT_TIMESTAMP)`
        : `status = 'completed', seller_approved_at = CURRENT_TIMESTAMP`;

    const upd = await client.query(
      `UPDATE coin_seller_orders SET ${statusFields} WHERE id = $1 RETURNING *`,
      [orderId, approverId]
    );

    await client.query('COMMIT');
    await auditLogService.log(approverId, 'coin_seller.order_approved', {
      entity_type: 'coin_seller_order',
      entity_id: orderId,
      metadata: { role, coins: order.coins },
    });
    return upd.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listOrdersForUser(userId, { role = 'buyer' } = {}) {
  const col = role === 'seller' ? 'seller_id' : 'buyer_id';
  const res = await db.query(
    `SELECT o.*, 
            buyer.first_name AS buyer_first_name, seller.first_name AS seller_first_name
     FROM coin_seller_orders o
     JOIN users buyer ON buyer.id = o.buyer_id
     JOIN users seller ON seller.id = o.seller_id
     WHERE o.${col} = $1
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [userId]
  );
  return res.rows;
}

module.exports = {
  getProfile,
  listActiveSellers,
  upsertProfile,
  createPendingOrder,
  attachPaymentProof,
  completeOrder,
  listOrdersForUser,
};
