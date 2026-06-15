const db = require('../config/database');
const coinSellerService = require('./coinSellerService');

async function getLiveDashboard() {
  const [rooms, users, wallet, reports, sellers] = await Promise.all([
    db.query(
      `SELECT lr.id, lr.channel, lr.title, lr.viewer_count, lr.started_at, u.first_name AS host_name
       FROM live_rooms lr
       JOIN users u ON u.id = lr.host_user_id
       WHERE lr.status = 'live'
       ORDER BY lr.viewer_count DESC NULLS LAST
       LIMIT 50`
    ),
    db.query(
      `SELECT COUNT(*)::int AS active_users FROM users
       WHERE last_seen_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes' AND deleted_at IS NULL`
    ),
    db.query(
      `SELECT COALESCE(SUM(balance_coins), 0)::bigint AS total_coins,
              COUNT(*)::int AS wallet_count
       FROM wallets`
    ),
    db.query(
      `SELECT COUNT(*)::int AS open_reports FROM moderation_reports
       WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`
    ),
    db.query(
      `SELECT o.id, o.status, o.coins, o.amount_inr, o.created_at,
              buyer.first_name AS buyer_name, seller.first_name AS seller_name
       FROM coin_seller_orders o
       JOIN users buyer ON buyer.id = o.buyer_id
       JOIN users seller ON seller.id = o.seller_id
       WHERE o.status IN ('pending', 'proof_submitted')
       ORDER BY o.created_at DESC
       LIMIT 30`
    ),
  ]);

  return {
    active_rooms: rooms.rows,
    active_users: users.rows[0]?.active_users || 0,
    wallet: wallet.rows[0],
    recent_reports: reports.rows[0]?.open_reports || 0,
    pending_coin_seller_orders: sellers.rows,
    generated_at: new Date().toISOString(),
  };
}

module.exports = { getLiveDashboard };
