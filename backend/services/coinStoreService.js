const db = require('../config/database');
const paymentService = require('./paymentService');

async function listPackages() {
  const res = await db.query(
    `SELECT id, slug, name, coins, price_inr, bonus_coins, sort_order
     FROM coin_packages WHERE is_active = TRUE ORDER BY sort_order, price_inr`
  );
  return res.rows;
}

async function purchasePackage(userId, packageId) {
  const pkgRes = await db.query(
    `SELECT * FROM coin_packages WHERE id = $1 AND is_active = TRUE`,
    [packageId]
  );
  const pkg = pkgRes.rows[0];
  if (!pkg) throw new Error('Package not found');

  const totalCoins = Number(pkg.coins) + Number(pkg.bonus_coins || 0);
  const intentRes = await db.query(
    `INSERT INTO payment_intents (user_id, provider, amount_inr, coins_expected, status, metadata)
     VALUES ($1, 'razorpay', $2, $3, 'created', $4) RETURNING *`,
    [
      userId,
      pkg.price_inr,
      totalCoins,
      JSON.stringify({ package_id: pkg.id, package_slug: pkg.slug, bonus_coins: pkg.bonus_coins }),
    ]
  );
  return { package: pkg, intent: intentRes.rows[0] };
}

async function createRazorpayForPackage(intentId, userId) {
  return paymentService.createRazorpayOrder(intentId, userId);
}

async function listPurchaseHistory(userId, limit = 30) {
  const res = await db.query(
    `SELECT id, amount_inr, coins_expected, status, provider, created_at, updated_at, metadata
     FROM payment_intents
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

module.exports = {
  listPackages,
  purchasePackage,
  createRazorpayForPackage,
  listPurchaseHistory,
};
