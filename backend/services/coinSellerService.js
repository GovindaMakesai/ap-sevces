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
  if (!buyerId) throw new Error('Buyer is required');

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
    const svipService = require('./svipService');
    svipService.scheduleSvipRefresh(order.buyer_id);
    return upd.rows[0];
  } catch (e) {
    await db.safeRollback(client);
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

const SELLER_LEVELS = [
  { slug: 'zero', label: 'Zero', minRechargeUsd: 0, beansPer10k: 7000, coinsPerUsd: 9100 },
  { slug: 'beginner', label: 'Beginner', minRechargeUsd: 300, beansPer10k: 9500, coinsPerUsd: 9100 },
  { slug: 'standard', label: 'Standard', minRechargeUsd: 800, beansPer10k: 9700, coinsPerUsd: 9100 },
  { slug: 'senior', label: 'Senior', minRechargeUsd: 1500, beansPer10k: 9800, coinsPerUsd: 9100 },
  { slug: 'super', label: 'Super', minRechargeUsd: 3000, beansPer10k: 9900, coinsPerUsd: 9100 },
];

const RECHARGE_PACKAGES = [
  { coins: 480000, usd: 50 },
  { coins: 960000, usd: 100 },
  { coins: 1920000, usd: 200 },
  { coins: 2880000, usd: 300 },
  { coins: 3840000, usd: 400 },
];

function resolveSellerLevel(totalRechargeUsd) {
  const usd = Number(totalRechargeUsd) || 0;
  let level = SELLER_LEVELS[0];
  for (const row of SELLER_LEVELS) {
    if (usd >= row.minRechargeUsd) level = row;
  }
  return level;
}

async function ensureSellerAccess(userId) {
  const wallet = await walletService.getOrCreateWallet(userId);
  const balance = Number(wallet.coin_balance);
  const userRes = await db.query('SELECT role, first_name, last_name FROM users WHERE id = $1', [userId]);
  const user = userRes.rows[0];
  const privileged = ['coin_seller', 'admin', 'super_admin', 'founder', 'ceo'].includes(user?.role);

  let profile = await getProfile(userId);
  const hasActiveProfile = !!(profile && profile.is_active);
  const sellable = Number(profile?.inventory_coins || 0) + balance;
  const allowed = privileged || balance >= 100000 || hasActiveProfile || sellable >= 100000;
  if (!allowed) return null;

  const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Coin Seller';
  if (!profile) {
    profile = await upsertProfile(userId, { displayName: name, inventoryCoins: 0, isActive: true });
  } else if (!profile.is_active) {
    profile = await upsertProfile(userId, { displayName: profile.display_name || name, isActive: true });
  }

  if (!privileged && (balance >= 100000 || sellable >= 100000)) {
    try {
      const { syncUserRole } = require('./permissionService');
      const promoteable = !user?.role || ['customer', 'worker', 'user'].includes(String(user.role));
      if (promoteable) await syncUserRole(userId, 'coin_seller');
    } catch (_e) {
      /* ignore */
    }
  }
  return profile;
}

async function getDashboard(userId) {
  const profile = await ensureSellerAccess(userId);
  if (!profile) throw new Error('Coin seller profile not found — need 100,000+ NR coins or admin approval');

  const userRes = await db.query(
    `SELECT id, first_name, last_name, profile_pic, role, is_verified, display_id, created_at FROM users WHERE id = $1`,
    [userId]
  );
  const user = userRes.rows[0];
  const wallet = await walletService.getOrCreateWallet(userId);
  const level = resolveSellerLevel(profile.total_recharge_usd);

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const statsRes = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN transfer_type = 'user' THEN coins ELSE 0 END), 0)::bigint AS coins_sold,
       COUNT(*)::int AS transfer_count
     FROM coin_seller_transfers
     WHERE seller_id = $1 AND created_at >= $2`,
    [userId, since.toISOString()]
  );
  const rechargeRes = await db.query(
    `SELECT COALESCE(SUM(amount_inr), 0) AS total_inr
     FROM coin_seller_orders
     WHERE seller_id = $1 AND status = 'completed' AND created_at >= $2`,
    [userId, since.toISOString()]
  );

  const transfers = await listTransfers(userId, { limit: 20 });
  const pendingRechargeRes = await db.query(
    `SELECT COUNT(*)::int AS pending_count,
            COALESCE(SUM(package_coins), 0)::bigint AS pending_coins
     FROM coin_seller_recharges
     WHERE seller_id = $1 AND status = 'pending'`,
    [userId]
  );
  const recentRechargeRes = await db.query(
    `SELECT id, package_coins, amount_usd, status, created_at, updated_at
     FROM coin_seller_recharges
     WHERE seller_id = $1
     ORDER BY updated_at DESC
     LIMIT 5`,
    [userId]
  );
  const lowBalanceUsd = Number(profile.inventory_coins) / (level.coinsPerUsd || 9100);
  const sellableCoins = Number(profile.inventory_coins) + Number(wallet.coin_balance);
  const giftCoins = Number(profile.gift_inventory_coins || 0);

  return {
    profile: {
      ...profile,
      inventory_coins: Number(profile.inventory_coins || 0),
      gift_inventory_coins: giftCoins,
    },
    user,
    wallet: {
      coin_balance: Number(wallet.coin_balance),
      star_balance: Number(wallet.star_balance),
    },
    sellable_coins: sellableCoins,
    gift_coins: giftCoins,
    level,
    levels: SELLER_LEVELS,
    rechargePackages: RECHARGE_PACKAGES,
    stats: {
      coinsSold: Number(statsRes.rows[0]?.coins_sold || 0),
      transferCount: Number(statsRes.rows[0]?.transfer_count || 0),
      beansExchanged: Number(profile.beans_exchanged || 0),
      rechargeInr: Number(rechargeRes.rows[0]?.total_inr || 0),
      periodDays: 30,
    },
    lowBalanceWarning: lowBalanceUsd < 10,
    lowBalanceUsd: Math.round(lowBalanceUsd * 100) / 100,
    recentTransfers: transfers,
    pendingRecharges: {
      count: Number(pendingRechargeRes.rows[0]?.pending_count || 0),
      coins: Number(pendingRechargeRes.rows[0]?.pending_coins || 0),
    },
    recentRecharges: recentRechargeRes.rows,
    earnings: {
      coin_trading: Number(statsRes.rows[0]?.coins_sold || 0),
      referral_program: 0,
      room_promotion: 0,
      creator_support: 0,
      featured_listings: 0,
      sponsored_placements: 0,
      agency_management: 0,
      event_hosting: 0,
      affiliate: 0,
    },
  };
}

async function listTransfers(sellerId, { limit = 30 } = {}) {
  const res = await db.query(
    `SELECT t.*, u.first_name, u.last_name, u.profile_pic, u.display_id
     FROM coin_seller_transfers t
     JOIN users u ON u.id = t.recipient_id
     WHERE t.seller_id = $1
     ORDER BY t.created_at DESC
     LIMIT $2`,
    [sellerId, limit]
  );
  return res.rows;
}

async function lookupRecipient(accountId) {
  const id = String(accountId || '').trim();
  if (!id) return null;
  const displayId = /^\d{4,10}$/.test(id) ? Number(id) : null;
  const res = await db.query(
    `SELECT id, first_name, last_name, profile_pic, role, display_id FROM users
     WHERE id::text = $1
        OR phone = $1
        OR ($2::int IS NOT NULL AND display_id = $2)
     LIMIT 1`,
    [id, displayId]
  );
  return res.rows[0] || null;
}

async function transferCoins(sellerId, { recipientId, coins, transferType = 'user' }) {
  const amount = parseInt(coins, 10);
  if (!amount || amount < 1000) throw new Error('Minimum transfer is 1,000 coins');
  if (!recipientId) throw new Error('Recipient is required');

  const recipient = await lookupRecipient(recipientId);
  if (!recipient) throw new Error('User not found');
  const isSelfSale = String(sellerId) === String(recipient.id);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '8s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    const sellerRes = await client.query(
      `SELECT * FROM coin_seller_profiles WHERE user_id = $1 FOR UPDATE`,
      [sellerId]
    );
    let seller = sellerRes.rows[0];
    const roleRes = await client.query(`SELECT role, first_name, last_name FROM users WHERE id = $1`, [sellerId]);
    const sellerUser = roleRes.rows[0];
    const privileged = ['coin_seller', 'admin', 'super_admin', 'founder', 'ceo'].includes(
      sellerUser?.role
    );
    if (!seller) {
      if (!privileged) throw new Error('Seller profile not found');
      const displayName =
        `${sellerUser?.first_name || ''} ${sellerUser?.last_name || ''}`.trim() || 'Coin Seller';
      await client.query(
        `INSERT INTO coin_seller_profiles (user_id, display_name, inventory_coins, gift_inventory_coins, is_active)
         VALUES ($1, $2, 0, 0, TRUE)
         ON CONFLICT (user_id) DO UPDATE SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP`,
        [sellerId, displayName]
      );
      const again = await client.query(
        `SELECT * FROM coin_seller_profiles WHERE user_id = $1 FOR UPDATE`,
        [sellerId]
      );
      seller = again.rows[0];
      if (!seller) throw new Error('Seller profile not found');
    }
    if (!seller.is_active) {
      if (!privileged) throw new Error('Seller profile not active');
      await client.query(
        `UPDATE coin_seller_profiles SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
        [sellerId]
      );
      seller = { ...seller, is_active: true };
    }

    const wallet = await walletService.getOrCreateWallet(sellerId, client);
    /* Sell coins = inventory first (own pool). Wallet only fills the gap — never gift stock.
       Self-sale: move sell stock → personal wallet only (do not debit then re-credit wallet). */
    const inventoryAvail = Number(seller.inventory_coins || 0);
    const walletAvail = Number(wallet?.coin_balance || 0);
    let fromInventory = 0;
    let fromWallet = 0;

    if (isSelfSale) {
      if (inventoryAvail < amount) {
        throw new Error(
          `Insufficient sell stock to move to your wallet (have ${inventoryAvail.toLocaleString()}, need ${amount.toLocaleString()}). Top-up sell stock first.`
        );
      }
      fromInventory = amount;
      fromWallet = 0;
    } else {
      const totalAvail = inventoryAvail + walletAvail;
      if (totalAvail < amount) {
        throw new Error(
          `Insufficient sell coins (have ${totalAvail.toLocaleString()}, need ${amount.toLocaleString()}). Top-up sell stock to send. Gift coins cannot be sold.`
        );
      }
      fromInventory = Math.min(amount, inventoryAvail);
      fromWallet = amount - fromInventory;
    }

    if (fromInventory > 0) {
      await client.query(
        `UPDATE coin_seller_profiles
         SET inventory_coins = inventory_coins - $2, total_sold = total_sold + $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [sellerId, fromInventory]
      );
    }

    if (fromWallet > 0) {
      await walletService.debitCoins(
        sellerId,
        fromWallet,
        {
          type: 'coin_seller_sale',
          reference_type: 'coin_seller_transfer',
          metadata: { recipientId: recipient.id, transferType, selfSale: false },
        },
        client
      );
      await client.query(
        `UPDATE coin_seller_profiles
         SET total_sold = total_sold + $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [sellerId, fromWallet]
      );
    }

    await walletService.creditCoins(
      recipient.id,
      amount,
      {
        type: 'coin_seller_transfer',
        reference_type: 'coin_seller_transfer',
        metadata: { sellerId, transferType, fromInventory, fromWallet, selfSale: isSelfSale },
      },
      client
    );

    const xfer = await client.query(
      `INSERT INTO coin_seller_transfers (seller_id, recipient_id, coins, transfer_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sellerId, recipient.id, amount, transferType === 'seller' ? 'seller' : 'user']
    );

    const invAfter = inventoryAvail - fromInventory;
    const walletAfter = isSelfSale ? walletAvail + amount : walletAvail - fromWallet;
    const sellableAfter = invAfter + (isSelfSale ? walletAfter : walletAvail - fromWallet);

    await client.query('COMMIT');

    void auditLogService
      .log(sellerId, 'coin_seller.transfer', {
        entity_type: 'coin_seller_transfer',
        entity_id: xfer.rows[0].id,
        metadata: { recipientId: recipient.id, coins: amount, fromInventory, fromWallet, selfSale: isSelfSale },
      })
      .catch(() => {});

    const svipService = require('./svipService');
    svipService.scheduleSvipRefresh(recipient.id);

    /* Notify buyer: chat + AP Services message + notification (skip noise for self-sale) */
    if (!isSelfSale) {
      try {
        const sellerUserNotify = await db.query(
          `SELECT first_name, last_name, display_id FROM users WHERE id = $1`,
          [sellerId]
        );
        const s = sellerUserNotify.rows[0];
        const sellerName =
          `${s?.first_name || ''} ${s?.last_name || ''}`.trim() ||
          s?.display_id ||
          'Coin seller';
        const systemMessageService = require('./systemMessageService');
        void systemMessageService
          .notifyCoinsReceivedFromSeller(recipient.id, amount, {
            sellerId,
            sellerName,
          })
          .catch((err) => console.error('notifyCoinsReceivedFromSeller:', err.message));
      } catch (notifyErr) {
        console.error('transfer notify setup:', notifyErr.message);
      }
    }

    /* Re-read balances after commit for accurate response */
    const balWallet = await walletService.getOrCreateWallet(sellerId);
    const balProfile = await getProfile(sellerId);
    const inventory_coins = Number(balProfile?.inventory_coins || invAfter);
    const coin_balance = Number(balWallet?.coin_balance || walletAfter);
    const gift_inventory_coins = Number(balProfile?.gift_inventory_coins || 0);

    return {
      transfer: xfer.rows[0],
      recipient,
      selfSale: isSelfSale,
      seller_balance: {
        inventory_coins,
        gift_inventory_coins,
        gift_coins: gift_inventory_coins,
        coin_balance,
        sellable_coins: inventory_coins + coin_balance,
      },
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_r) {
      await db.safeRollback?.(client);
    }
    throw e;
  } finally {
    client.release();
  }
}

async function exchangeSellerCoins(sellerId, coinsAmount) {
  const amount = parseInt(coinsAmount, 10);
  if (!amount || amount < 1) {
    throw new Error('Enter a valid amount of sell coins to exchange');
  }

  const profile = await getProfile(sellerId);
  if (!profile?.is_active) throw new Error('Seller profile not active');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const sellerRes = await client.query(
      `SELECT * FROM coin_seller_profiles WHERE user_id = $1 FOR UPDATE`,
      [sellerId]
    );
    const seller = sellerRes.rows[0];
    if (!seller) throw new Error('Seller profile not found');

    const wallet = await walletService.getOrCreateWallet(sellerId, client);
    const inventoryAvail = Number(seller.inventory_coins || 0);
    const walletAvail = Number(wallet?.coin_balance || 0);
    const totalAvail = inventoryAvail + walletAvail;

    if (totalAvail < amount) {
      throw new Error(
        `Insufficient sell coins (have ${totalAvail.toLocaleString()}, need ${amount.toLocaleString()}). Top-up sell stock or add wallet coins first.`
      );
    }

    const fromInventory = Math.min(amount, inventoryAvail);
    const fromWallet = amount - fromInventory;

    if (fromInventory > 0) {
      await client.query(
        `UPDATE coin_seller_profiles
         SET inventory_coins = inventory_coins - $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [sellerId, fromInventory]
      );
    }

    if (fromWallet > 0) {
      await walletService.debitCoins(
        sellerId,
        fromWallet,
        {
          type: 'coin_seller_gift_exchange',
          reference_type: 'coin_seller_exchange',
          metadata: { giftCoinsOut: amount, fromInventory, fromWallet },
        },
        client
      );
    }

    /* Sell coins → gift stock (1:1). Gift coins are for live/chat gifts only. */
    await client.query(
      `UPDATE coin_seller_profiles
       SET gift_inventory_coins = gift_inventory_coins + $2,
           beans_exchanged = beans_exchanged + $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [sellerId, amount]
    );

    await client.query('COMMIT');
    await auditLogService.log(sellerId, 'coin_seller.sell_to_gift_exchange', {
      entity_type: 'coin_seller_profile',
      entity_id: sellerId,
      metadata: {
        sellCoinsIn: amount,
        giftCoinsOut: amount,
        fromInventory,
        fromWallet,
        destination: 'gift_inventory',
      },
    });

    const balWallet = await walletService.getOrCreateWallet(sellerId);
    const balProfile = await getProfile(sellerId);
    return {
      sellCoinsIn: amount,
      coinsOut: amount,
      beans: amount,
      fromInventory,
      fromWallet,
      destination: 'gift_inventory',
      inventory_coins: Number(balProfile?.inventory_coins || inventoryAvail - fromInventory),
      gift_inventory_coins: Number(balProfile?.gift_inventory_coins || Number(seller.gift_inventory_coins || 0) + amount),
      coin_balance: Number(balWallet?.coin_balance || walletAvail - fromWallet),
      sellable_coins:
        Number(balProfile?.inventory_coins || 0) + Number(balWallet?.coin_balance || 0),
    };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

/** @deprecated Use exchangeSellerCoins — kept for older clients sending `beans`. */
async function exchangeBeans(sellerId, beansAmount) {
  return exchangeSellerCoins(sellerId, beansAmount);
}

/**
 * Debit gift spend:
 * - Coin sellers: gift_inventory_coins ONLY (never sell stock / wallet)
 * - Normal users: wallet coin_balance only
 */
async function debitGiftSpend(userId, amount, meta = {}, client) {
  const amt = parseInt(amount, 10);
  if (!amt || amt <= 0) throw new Error('Gift amount must be positive');

  const run = async (c) => {
    const roleRes = await c.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    const role = String(roleRes.rows[0]?.role || '');
    const profileRes = await c.query(
      `SELECT gift_inventory_coins, inventory_coins, is_active FROM coin_seller_profiles WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const profile = profileRes.rows[0];
    /* Must match walletController.getBalance giftable rules */
    const useGiftInventory =
      role === 'coin_seller' ||
      !!(profile && profile.is_active) ||
      (['admin', 'super_admin', 'founder', 'ceo'].includes(role) && !!profile?.is_active);

    if (useGiftInventory && profile) {
      const giftAvail = Number(profile.gift_inventory_coins || 0);
      if (giftAvail < amt) {
        const err = new Error(
          `Insufficient gift coins (have ${giftAvail.toLocaleString()}, need ${amt.toLocaleString()}). Exchange sell coins → gift coins in Seller Center. Sell coins cannot be used for gifts.`
        );
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
      }
      await c.query(
        `UPDATE coin_seller_profiles
         SET gift_inventory_coins = gift_inventory_coins - $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId, amt]
      );
      const tx = await c.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
         VALUES ($1, $2, $3, 'coin', $4, $5, 'completed', $6)
         RETURNING id`,
        [
          userId,
          meta.type || 'gift_sent',
          (-amt).toString(),
          meta.reference_type || 'gift',
          meta.reference_id || null,
          JSON.stringify({
            ...(meta.metadata || {}),
            from_gift_inventory: amt,
            from_wallet: 0,
            source: 'gift_inventory',
          }),
        ]
      );
      const wallet = await walletService.getOrCreateWallet(userId, c);
      return {
        balance: Number(wallet.coin_balance),
        gift_inventory_coins: giftAvail - amt,
        from_gift_inventory: amt,
        from_wallet: 0,
        coin_balance: Number(wallet.coin_balance),
        play_source: 'gift_inventory',
        play_balance: giftAvail - amt,
        transaction: tx.rows[0],
      };
    }

    const walletResult = await walletService.debitCoins(
      userId,
      amt,
      {
        ...meta,
        metadata: {
          ...(meta.metadata || {}),
          from_gift_inventory: 0,
          from_wallet: amt,
        },
      },
      c
    );
    return {
      balance: Number(walletResult.balance),
      gift_inventory_coins: 0,
      from_gift_inventory: 0,
      from_wallet: amt,
      coin_balance: Number(walletResult.balance),
      play_source: 'wallet',
      play_balance: Number(walletResult.balance),
      transaction: walletResult.transaction,
    };
  };

  if (client) return run(client);
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const result = await run(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await db.safeRollback(c);
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Game spend: same pools as gifting.
 * - Coin sellers / gift-inventory users: gift_inventory_coins ONLY
 * - Everyone else: wallet coin_balance (simple coins)
 */
async function debitGameSpend(userId, amount, meta = {}, client) {
  try {
    return await debitGiftSpend(
      userId,
      amount,
      {
        ...meta,
        type: meta.type || 'game_bet',
        reference_type: meta.reference_type || 'game_round',
        metadata: { ...(meta.metadata || {}), purpose: 'game_bet' },
      },
      client
    );
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE' && /gift coin/i.test(String(err.message || ''))) {
      err.message = String(err.message).replace(/gifts\.?$/i, 'games play.').replace(
        /Sell coins cannot be used for gifts\./i,
        'Sell coins cannot be used for games — exchange sell coins → gift coins in Seller Center.'
      );
    }
    throw err;
  }
}

/**
 * Credit game wins back into the same pool that was debited.
 * @param {'gift_inventory'|'wallet'} source
 */
async function creditGameWin(userId, amount, source, meta = {}, client) {
  const amt = parseInt(amount, 10);
  if (!amt || amt <= 0) {
    const wallet = await walletService.getOrCreateWallet(userId, client);
    return {
      balance: Number(wallet.coin_balance),
      gift_inventory_coins: 0,
      play_source: source || 'wallet',
      play_balance: Number(wallet.coin_balance),
      transaction: { id: null },
    };
  }

  const run = async (c) => {
    if (source === 'gift_inventory') {
      const profileRes = await c.query(
        `SELECT gift_inventory_coins FROM coin_seller_profiles WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      if (!profileRes.rows[0]) {
        throw new Error('Gift inventory profile not found for game win credit');
      }
      const before = Number(profileRes.rows[0].gift_inventory_coins || 0);
      await c.query(
        `UPDATE coin_seller_profiles
         SET gift_inventory_coins = gift_inventory_coins + $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId, amt]
      );
      const tx = await c.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
         VALUES ($1, $2, $3, 'coin', $4, $5, 'completed', $6)
         RETURNING id`,
        [
          userId,
          meta.type || 'game_win',
          amt.toString(),
          meta.reference_type || 'game_round',
          meta.reference_id || null,
          JSON.stringify({
            ...(meta.metadata || {}),
            to_gift_inventory: amt,
            to_wallet: 0,
            source: 'gift_inventory',
          }),
        ]
      );
      const wallet = await walletService.getOrCreateWallet(userId, c);
      return {
        balance: Number(wallet.coin_balance),
        gift_inventory_coins: before + amt,
        play_source: 'gift_inventory',
        play_balance: before + amt,
        transaction: tx.rows[0],
      };
    }

    const credited = await walletService.creditCoins(userId, amt, meta, c);
    return {
      balance: Number(credited.balance),
      gift_inventory_coins: 0,
      play_source: 'wallet',
      play_balance: Number(credited.balance),
      transaction: credited.transaction,
    };
  };

  if (client) return run(client);
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const result = await run(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await db.safeRollback(c);
    throw e;
  } finally {
    c.release();
  }
}

/** Resolve which balance games should display for this user. */
async function getGamePlayBalance(userId) {
  const roleRes = await db.query(`SELECT role FROM users WHERE id = $1`, [userId]);
  const role = String(roleRes.rows[0]?.role || '');
  const profile = await getProfile(userId);
  const useGiftInventory =
    role === 'coin_seller' ||
    !!(profile && profile.is_active) ||
    (['admin', 'super_admin', 'founder', 'ceo'].includes(role) && !!profile?.is_active);

  if (useGiftInventory && profile) {
    return {
      play_source: 'gift_inventory',
      play_balance: Number(profile.gift_inventory_coins || 0),
      coin_balance: 0,
      gift_inventory_coins: Number(profile.gift_inventory_coins || 0),
    };
  }
  const wallet = await walletService.getBalance(userId);
  return {
    play_source: 'wallet',
    play_balance: Number(wallet.coin_balance || 0),
    coin_balance: Number(wallet.coin_balance || 0),
    gift_inventory_coins: 0,
  };
}

async function applyRecharge(sellerId, { packageCoins, paymentChannel }) {
  const pkg = RECHARGE_PACKAGES.find((p) => p.coins === parseInt(packageCoins, 10));
  if (!pkg) throw new Error('Invalid recharge package');
  const profile = await getProfile(sellerId);
  if (!profile?.is_active) throw new Error('Seller profile not active');

  const res = await db.query(
    `UPDATE coin_seller_profiles
     SET inventory_coins = inventory_coins + $2,
         total_recharge_usd = total_recharge_usd + $3,
         seller_level = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
     RETURNING *`,
    [sellerId, pkg.coins, pkg.usd, resolveSellerLevel(Number(profile.total_recharge_usd) + pkg.usd).slug]
  );

  await auditLogService.log(sellerId, 'coin_seller.recharge', {
    entity_type: 'coin_seller_profile',
    entity_id: sellerId,
    metadata: { packageCoins: pkg.coins, usd: pkg.usd, paymentChannel },
  });
  return res.rows[0];
}

async function createPendingSellerRecharge(
  sellerId,
  { packageCoins, paymentChannel, transactionId, paymentProofAssetId }
) {
  const pkg = RECHARGE_PACKAGES.find((p) => p.coins === parseInt(packageCoins, 10));
  if (!pkg) throw new Error('Invalid recharge package');
  const profile = await getProfile(sellerId);
  if (!profile?.is_active) throw new Error('Seller profile not active');

  const utr = transactionId ? String(transactionId).trim().replace(/\s+/g, '') : '';
  if (!utr || !/^\d{10,22}$/.test(utr)) {
    throw new Error('Valid 10–22 digit UTR is required');
  }
  if (utr) {
    const dup = await db.query(
      `SELECT id FROM coin_seller_recharges
       WHERE LOWER(TRIM(transaction_id)) = LOWER($1) AND status NOT IN ('rejected') LIMIT 1`,
      [utr]
    );
    if (dup.rows.length) throw new Error('This payment reference was already submitted');
  }

  const res = await db.query(
    `INSERT INTO coin_seller_recharges
       (seller_id, package_coins, amount_usd, payment_channel, transaction_id, payment_proof_asset_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
    [sellerId, pkg.coins, pkg.usd, paymentChannel || 'manual', utr || null, paymentProofAssetId || null]
  );
  await auditLogService.log(sellerId, 'coin_seller.recharge_pending', {
    entity_type: 'coin_seller_recharge',
    entity_id: res.rows[0].id,
    metadata: { packageCoins: pkg.coins, usd: pkg.usd, paymentChannel },
  });
  try {
    await require('./adminNotificationService').notifyAllAdmins({
      type: 'seller_recharge',
      title: 'New seller stock top-up pending',
      message: `${Number(pkg.coins).toLocaleString()} sell-stock coins ($${pkg.usd}) awaiting approval.`,
      data: { recharge_id: res.rows[0].id, seller_id: sellerId },
      excludeUserIds: [sellerId],
    });
  } catch (_e) {
    /* non-fatal */
  }
  return res.rows[0];
}

async function listSellerRecharges(sellerId, { limit = 20 } = {}) {
  const res = await db.query(
    `SELECT id, package_coins, amount_usd, payment_channel, transaction_id, status, rejection_reason, created_at, updated_at
     FROM coin_seller_recharges WHERE seller_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [sellerId, limit]
  );
  return res.rows;
}

async function approveSellerRecharge(rechargeId, adminUserId, notes) {
  const client = await db.pool.connect();
  let credited = null;
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT * FROM coin_seller_recharges WHERE id = $1 FOR UPDATE`,
      [rechargeId]
    );
    if (!r.rows.length) throw new Error('Seller recharge not found');
    const row = r.rows[0];
    if (row.status !== 'pending') throw new Error('Recharge already processed');

    const coinsToCredit = Number(row.package_coins);
    if (!coinsToCredit || coinsToCredit <= 0) throw new Error('Invalid package coin amount');

    let profileRes = await client.query(
      `SELECT * FROM coin_seller_profiles WHERE user_id = $1 FOR UPDATE`,
      [row.seller_id]
    );
    let profile = profileRes.rows[0];
    if (!profile) {
      const userRes = await client.query(
        `SELECT first_name, last_name FROM users WHERE id = $1`,
        [row.seller_id]
      );
      const user = userRes.rows[0];
      const displayName =
        `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Coin Seller';
      await client.query(
        `INSERT INTO coin_seller_profiles (user_id, display_name, inventory_coins, is_active)
         VALUES ($1, $2, 0, TRUE)
         ON CONFLICT (user_id) DO NOTHING`,
        [row.seller_id, displayName]
      );
      profileRes = await client.query(
        `SELECT * FROM coin_seller_profiles WHERE user_id = $1 FOR UPDATE`,
        [row.seller_id]
      );
      profile = profileRes.rows[0];
      if (!profile) throw new Error('Seller profile not found');
    }

    const newTotalUsd = Number(profile.total_recharge_usd || 0) + Number(row.amount_usd || 0);
    const profileUpd = await client.query(
      `UPDATE coin_seller_profiles
       SET inventory_coins = COALESCE(inventory_coins, 0) + $2,
           total_recharge_usd = COALESCE(total_recharge_usd, 0) + $3,
           seller_level = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING inventory_coins, total_recharge_usd, seller_level`,
      [row.seller_id, coinsToCredit, row.amount_usd, resolveSellerLevel(newTotalUsd).slug]
    );

    const rechargeUpd = await client.query(
      `UPDATE coin_seller_recharges
       SET status = 'approved', admin_reviewed_by = $2, admin_notes = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [rechargeId, adminUserId, notes || null]
    );

    await client.query('COMMIT');
    credited = {
      recharge: rechargeUpd.rows[0],
      seller_id: row.seller_id,
      coins_credited: coinsToCredit,
      inventory_coins: Number(profileUpd.rows[0]?.inventory_coins || 0),
      credit_target: 'seller_inventory',
    };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }

  try {
    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: credited.seller_id,
      type: 'seller_recharge',
      title: 'Seller stock approved',
      message: `${credited.coins_credited.toLocaleString()} coins added to your seller stock (Coin Seller Center).`,
      data: {
        recharge_id: rechargeId,
        package_coins: credited.coins_credited,
        inventory_coins: credited.inventory_coins,
      },
    });

    const systemMessageService = require('./systemMessageService');
    await systemMessageService.notifyCoinsCredited(credited.seller_id, credited.coins_credited, {
      source: 'seller_inventory',
    });
  } catch (notifyErr) {
    console.error('approveSellerRecharge notifications:', notifyErr.message);
  }

  const svipService = require('./svipService');
  svipService.scheduleSvipRefresh(credited.seller_id);

  return credited;
}

async function rejectSellerRecharge(rechargeId, adminUserId, reason) {
  const res = await db.query(
    `UPDATE coin_seller_recharges
     SET status = 'rejected', rejection_reason = $2, admin_reviewed_by = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [rechargeId, reason || 'Rejected by admin', adminUserId]
  );
  if (!res.rows.length) throw new Error('Recharge not found or already processed');

  const Notification = require('../models/Notification');
  await Notification.create({
    user_id: res.rows[0].seller_id,
    type: 'seller_recharge',
    title: 'Seller top-up not approved',
    message: reason || 'Your seller inventory request was not approved. Contact support if needed.',
    data: { recharge_id: rechargeId, status: 'rejected' },
  });
  return res.rows[0];
}

module.exports = {
  getProfile,
  listActiveSellers,
  upsertProfile,
  createPendingOrder,
  attachPaymentProof,
  completeOrder,
  listOrdersForUser,
  getDashboard,
  ensureSellerAccess,
  listTransfers,
  lookupRecipient,
  transferCoins,
  exchangeSellerCoins,
  exchangeBeans,
  debitGiftSpend,
  debitGameSpend,
  creditGameWin,
  getGamePlayBalance,
  applyRecharge,
  createPendingSellerRecharge,
  listSellerRecharges,
  approveSellerRecharge,
  rejectSellerRecharge,
  SELLER_LEVELS,
  RECHARGE_PACKAGES,
};
