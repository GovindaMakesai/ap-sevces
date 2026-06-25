const db = require('../config/database');
const transactionService = require('./transactionService');
const coinSellerService = require('./coinSellerService');
const fileAssetService = require('./fileAssetService');
const walletService = require('./walletService');

function proofUrl(assetId) {
  if (!assetId) return null;
  return fileAssetService.buildSignedUrl(assetId, 3600);
}

async function listPendingPayments(limit = 80) {
  const settings = await walletService.getWalletSettings();
  const rate = settings.coins_per_inr || 10;

  const [consumerRes, sellerRes] = await Promise.all([
    db.query(
      `SELECT r.*,
              u.id AS user_uuid, u.email, u.first_name, u.last_name, u.phone, u.profile_pic,
              cp.name AS package_name, cp.coins AS package_coins, cp.bonus_coins AS package_bonus
       FROM recharges r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN coin_packages cp ON cp.price_inr = r.amount_inr AND cp.is_active = TRUE
       WHERE r.payment_status = 'pending'
       ORDER BY r.created_at ASC
       LIMIT $1`,
      [limit]
    ),
    db.query(
      `SELECT sr.*,
              u.id AS user_uuid, u.email, u.first_name, u.last_name, u.phone, u.profile_pic
       FROM coin_seller_recharges sr
       JOIN users u ON u.id = sr.seller_id
       WHERE sr.status = 'pending'
       ORDER BY sr.created_at ASC
       LIMIT $1`,
      [limit]
    ),
  ]);

  const consumer = consumerRes.rows.map((row) => {
    const pkgCoins =
      row.package_coins != null ? Number(row.package_coins) + Number(row.package_bonus || 0) : null;
    const estimatedCoins = pkgCoins ?? Math.floor(Number(row.amount_inr) * rate);
    return {
      id: row.id,
      source: 'recharges',
      request_type: 'coin_recharge',
      request_type_label: 'Coin Recharge',
      user_id: row.user_uuid,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      profile_pic: row.profile_pic,
      package_label: row.package_name || `₹${Number(row.amount_inr).toLocaleString('en-IN')} package`,
      amount_inr: Number(row.amount_inr),
      amount_display: `₹${Number(row.amount_inr).toLocaleString('en-IN')}`,
      estimated_coins: estimatedCoins,
      transaction_id: row.transaction_id,
      payment_proof_asset_id: row.payment_proof_asset_id,
      payment_proof_url: proofUrl(row.payment_proof_asset_id),
      payment_channel: row.payment_method,
      status: row.payment_status,
      created_at: row.created_at,
    };
  });

  const seller = sellerRes.rows.map((row) => ({
    id: row.id,
    source: 'coin_seller_recharges',
    request_type: 'seller_inventory',
    request_type_label: 'Seller Inventory Top-Up',
    user_id: row.user_uuid,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    profile_pic: row.profile_pic,
    package_label: `${Number(row.package_coins).toLocaleString('en-IN')} coins / $${Number(row.amount_usd)}`,
    amount_usd: Number(row.amount_usd),
    amount_display: `$${Number(row.amount_usd)}`,
    estimated_coins: Number(row.package_coins),
    transaction_id: row.transaction_id,
    payment_proof_asset_id: row.payment_proof_asset_id,
    payment_proof_url: proofUrl(row.payment_proof_asset_id),
    payment_channel: row.payment_channel,
    status: row.status,
    created_at: row.created_at,
  }));

  return [...consumer, ...seller].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

async function approvePayment(source, id, adminUserId, notes) {
  if (source === 'recharges') {
    return transactionService.approveRecharge(id, adminUserId, notes);
  }
  if (source === 'coin_seller_recharges') {
    return coinSellerService.approveSellerRecharge(id, adminUserId, notes);
  }
  throw new Error('Unknown payment source');
}

async function rejectPayment(source, id, adminUserId, notes) {
  if (source === 'recharges') {
    return transactionService.rejectRecharge(id, adminUserId, notes);
  }
  if (source === 'coin_seller_recharges') {
    return coinSellerService.rejectSellerRecharge(id, adminUserId, notes);
  }
  throw new Error('Unknown payment source');
}

module.exports = {
  listPendingPayments,
  approvePayment,
  rejectPayment,
};
