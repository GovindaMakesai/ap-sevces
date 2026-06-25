const followService = require('../services/followService');
const coinSellerService = require('../services/coinSellerService');
const socialFeedService = require('../services/socialFeedService');
const fileAssetService = require('../services/fileAssetService');
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
    const order = await coinSellerService.createPendingOrder({
      sellerId: req.params.sellerId,
      buyerId: uid(req),
      coins: req.body.coins,
      amountInr: req.body.amount_inr,
      referenceCode: req.body.reference_code,
    });
    res.status(201).json({ success: true, data: order, message: 'Order created. Upload payment proof to continue.' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function uploadSellerProof(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Payment proof file required' });
    const asset = await fileAssetService.registerPrivateFile({
      ownerId: uid(req),
      category: 'coin_seller',
      tempPath: req.file.path,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      sizeBytes: req.file.size,
    });
    const order = await coinSellerService.attachPaymentProof(req.params.orderId, uid(req), asset.id);
    res.json({
      success: true,
      data: order,
      proof_url: fileAssetService.buildSignedUrl(asset.id, 600),
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function approveSellerOrder(req, res) {
  try {
    const order = await coinSellerService.completeOrder(req.params.orderId, uid(req), { role: 'seller' });
    res.json({ success: true, data: order });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function rejectSellerOrder(req, res) {
  try {
    const order = await coinSellerService.completeOrder(req.params.orderId, uid(req), {
      role: 'seller',
      rejectionReason: req.body.reason || 'Rejected by seller',
    });
    res.json({ success: true, data: order });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function mySellerOrders(req, res) {
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';
  const data = await coinSellerService.listOrdersForUser(uid(req), { role });
  res.json({ success: true, data });
}

async function listPosts(req, res) {
  const data = await socialFeedService.listFeed(uid(req), {
    limit: parseInt(req.query.limit, 10) || 30,
    offset: parseInt(req.query.offset, 10) || 0,
  });
  res.json({ success: true, data });
}

async function createPost(req, res) {
  try {
    const post = await socialFeedService.createPost(uid(req), req.body);
    res.status(201).json({ success: true, data: post });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function likePost(req, res) {
  try {
    const data = await socialFeedService.toggleLike(req.params.postId, uid(req));
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function commentPost(req, res) {
  try {
    const data = await socialFeedService.addComment(req.params.postId, uid(req), req.body.body);
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function getComments(req, res) {
  const data = await socialFeedService.listComments(req.params.postId);
  res.json({ success: true, data });
}

async function sharePost(req, res) {
  const data = await socialFeedService.sharePost(req.params.postId);
  res.json({ success: true, data });
}

async function deletePost(req, res) {
  try {
    const data = await socialFeedService.deletePost(req.params.postId, uid(req));
    res.json({ success: true, data });
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

async function requireCoinSeller(req, res) {
  const id = uid(req);
  const profile = await coinSellerService.ensureSellerAccess(id);
  if (!profile) {
    res.status(403).json({ success: false, message: 'Coin seller access required — hold 100,000+ NR coins or contact admin' });
    return false;
  }
  return true;
}

async function coinSellerDashboard(req, res) {
  try {
    if (!(await requireCoinSeller(req, res))) return;
    const data = await coinSellerService.getDashboard(uid(req));
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function coinSellerLookupUser(req, res) {
  try {
    if (!(await requireCoinSeller(req, res))) return;
    const user = await coinSellerService.lookupRecipient(req.query.accountId || req.params.accountId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function coinSellerTransfer(req, res) {
  try {
    if (!(await requireCoinSeller(req, res))) return;
    const data = await coinSellerService.transferCoins(uid(req), {
      recipientId: req.body.recipient_id || req.body.accountId,
      coins: req.body.coins,
      transferType: req.body.transfer_type,
    });
    res.json({ success: true, data, message: 'Transfer completed' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function coinSellerExchange(req, res) {
  try {
    if (!(await requireCoinSeller(req, res))) return;
    const data = await coinSellerService.exchangeBeans(uid(req), req.body.beans);
    res.json({ success: true, data, message: 'Exchange completed' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function coinSellerRecharge(req, res) {
  try {
    if (!(await requireCoinSeller(req, res))) return;
    let paymentProofAssetId = null;
    if (req.file) {
      const fileAssetService = require('../services/fileAssetService');
      const asset = await fileAssetService.registerPrivateFile({
        ownerId: uid(req),
        category: 'recharge',
        tempPath: req.file.path,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        sizeBytes: req.file.size,
      });
      paymentProofAssetId = asset.id;
    }
    const row = await coinSellerService.createPendingSellerRecharge(uid(req), {
      packageCoins: req.body.package_coins,
      paymentChannel: req.body.payment_channel,
      transactionId: req.body.transaction_id,
      paymentProofAssetId,
    });
    res.status(201).json({
      success: true,
      data: row,
      message: 'Top-up submitted for admin verification. Inventory updates after approval.',
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function coinSellerRechargeHistory(req, res) {
  try {
    if (!(await requireCoinSeller(req, res))) return;
    const data = await coinSellerService.listSellerRecharges(uid(req), {
      limit: parseInt(req.query.limit, 10) || 20,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function coinSellerTransfers(req, res) {
  try {
    if (!(await requireCoinSeller(req, res))) return;
    const data = await coinSellerService.listTransfers(uid(req), {
      limit: parseInt(req.query.limit, 10) || 30,
    });
    res.json({ success: true, data });
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
  uploadSellerProof,
  approveSellerOrder,
  rejectSellerOrder,
  mySellerOrders,
  listPosts,
  createPost,
  likePost,
  commentPost,
  getComments,
  sharePost,
  deletePost,
  reportUser,
  coinSellerDashboard,
  coinSellerLookupUser,
  coinSellerTransfer,
  coinSellerExchange,
  coinSellerRecharge,
  coinSellerRechargeHistory,
  coinSellerTransfers,
};
