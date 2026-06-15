const followService = require('../services/followService');
const coinSellerService = require('../services/coinSellerService');
const db = require('../config/database');

function uid(req) {
  return req.userId;
}

async function followUser(req, res) {
  try {
    const data = await followService.follow(uid(req), req.params.userId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function unfollowUser(req, res) {
  try {
    const data = await followService.unfollow(uid(req), req.params.userId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function followStatus(req, res) {
  const following = await followService.isFollowing(uid(req), req.params.userId);
  res.json({ success: true, data: { following } });
}

async function myFollowing(req, res) {
  const data = await followService.getFollowing(uid(req), parseInt(req.query.limit, 10) || 50);
  res.json({ success: true, data });
}

async function userFollowers(req, res) {
  const userId = req.params.userId || uid(req);
  const data = await followService.getFollowers(userId, parseInt(req.query.limit, 10) || 50);
  res.json({ success: true, data });
}

async function followStats(req, res) {
  const userId = req.params.userId || uid(req);
  const data = await followService.getStats(userId);
  res.json({ success: true, data });
}

async function liveFollowing(req, res) {
  const data = await followService.getLiveFollowingIds(uid(req));
  res.json({ success: true, data });
}

async function listGiftCatalog(_req, res) {
  const res2 = await db.query(
    `SELECT slug, emoji, name, coin_cost, category, tier FROM gift_catalog
     WHERE is_active = TRUE ORDER BY category, sort_order, coin_cost`
  );
  res.json({ success: true, data: res2.rows });
}

async function listCoinSellers(_req, res) {
  const data = await coinSellerService.listActiveSellers();
  res.json({ success: true, data });
}

async function buyFromSeller(req, res) {
  try {
    const { coins, amount_inr, reference_code } = req.body;
    const order = await coinSellerService.sellCoins({
      sellerId: req.params.sellerId,
      buyerId: uid(req),
      coins,
      amountInr: amount_inr,
      referenceCode: reference_code,
    });
    res.status(201).json({ success: true, data: order });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function reportUser(req, res) {
  try {
    const { reported_user_id, live_room_id, channel, reason } = req.body;
    const row = await db.query(
      `INSERT INTO moderation_reports (reporter_id, reported_user_id, live_room_id, channel, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [uid(req), reported_user_id || null, live_room_id || null, channel || null, reason || 'unspecified']
    );
    res.status(201).json({ success: true, data: row.rows[0] });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

module.exports = {
  followUser,
  unfollowUser,
  followStatus,
  myFollowing,
  userFollowers,
  followStats,
  liveFollowing,
  listGiftCatalog,
  listCoinSellers,
  buyFromSeller,
  reportUser,
};
