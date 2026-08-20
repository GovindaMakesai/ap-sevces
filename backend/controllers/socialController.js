const followService = require('../services/followService');
const coinSellerService = require('../services/coinSellerService');
const socialFeedService = require('../services/socialFeedService');
const discoverCreatorService = require('../services/discoverCreatorService');
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
  const data = await followService.getRelation(uid(req), req.params.userId);
  res.json({ success: true, data });
}

async function blockUser(req, res) {
  try {
    const data = await followService.blockUser(uid(req), req.params.userId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function unblockUser(req, res) {
  try {
    const data = await followService.unblockUser(uid(req), req.params.userId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function blockStatus(req, res) {
  const blocked = await followService.isBlocked(uid(req), req.params.userId);
  res.json({ success: true, data: { blocked } });
}

async function myBlocked(req, res) {
  const data = await followService.getBlockedUsers(uid(req), parseInt(req.query.limit, 10) || 50);
  res.json({ success: true, data });
}

async function myFollowing(req, res) {
  const data = await followService.getFollowing(uid(req), parseInt(req.query.limit, 10) || 50);
  res.json({ success: true, data });
}

async function userFollowing(req, res) {
  const userId = req.params.userId || uid(req);
  const data = await followService.getFollowing(userId, parseInt(req.query.limit, 10) || 50);
  res.json({ success: true, data });
}

async function userFollowers(req, res) {
  const userId = req.params.userId || uid(req);
  const data = await followService.getFollowers(userId, parseInt(req.query.limit, 10) || 50);
  res.json({ success: true, data });
}

async function followStats(req, res) {
  const userId = req.params.userId || uid(req);
  if (!userId) {
    return res.status(400).json({ success: false, message: 'User id required' });
  }
  const data = await followService.getStats(userId);
  res.json({ success: true, data });
}

async function liveFollowing(req, res) {
  const data = await followService.getLiveFollowingIds(uid(req));
  res.json({ success: true, data });
}

async function discoverCreators(req, res) {
  try {
    const period = ['daily', 'weekly', 'monthly'].includes(req.query.period)
      ? req.query.period
      : 'weekly';
    const limit = parseInt(req.query.limit, 10) || 30;
    const data = await Promise.race([
      discoverCreatorService.discoverTopCreators({
        period,
        limit,
        viewerId: req.userId || null,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    res.json({ success: true, data });
  } catch (e) {
    console.warn('discoverCreators fallback:', e.message);
    try {
      const limit = parseInt(req.query.limit, 10) || 30;
      const data = await discoverCreatorService.discoverCreatorsFast({
        limit,
        viewerId: req.userId || null,
      });
      return res.json({ success: true, data });
    } catch (e2) {
      console.error('discoverCreators error:', e2);
      res.status(500).json({ success: false, message: 'Failed to load creators' });
    }
  }
}

async function creatorEngagement(req, res) {
  try {
    const data = await discoverCreatorService.getCreatorEngagement(
      req.params.userId,
      req.userId || null
    );
    if (!data) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }
    res.json({ success: true, data });
  } catch (e) {
    console.error('creatorEngagement error:', e);
    res.status(500).json({ success: false, message: 'Failed to load creator profile' });
  }
}

async function creatorProfilePanel(req, res) {
  try {
    const creatorProfilePanelService = require('../services/creatorProfilePanelService');
    const data = await creatorProfilePanelService.getProfilePanel(req.params.userId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    res.json({ success: true, data });
  } catch (e) {
    console.error('creatorProfilePanel error:', e);
    res.status(500).json({ success: false, message: 'Failed to load profile panel' });
  }
}

async function creatorSupporters(req, res) {
  try {
    const supporterService = require('../services/supporterService');
    const period = req.query.period || 'monthly';
    const [top, recent] = await Promise.all([
      supporterService.getTopSupporters(req.params.userId, { period, limit: req.query.limit }),
      supporterService.getRecentGifts(req.params.userId, { limit: req.query.recentLimit || 30 }),
    ]);
    res.json({
      success: true,
      data: { period, top, recent },
    });
  } catch (e) {
    console.error('creatorSupporters error:', e);
    res.status(500).json({ success: false, message: 'Failed to load supporters' });
  }
}

async function creatorBadges(req, res) {
  try {
    const profileBadgeService = require('../services/profileBadgeService');
    const data = await profileBadgeService.getProfileBadges(req.params.userId);
    res.json({ success: true, data });
  } catch (e) {
    console.error('creatorBadges error:', e);
    res.status(500).json({ success: false, message: 'Failed to load profile badges' });
  }
}

async function discoverRails(req, res) {
  try {
    const creatorDiscoveryService = require('../services/creatorDiscoveryService');
    const data = await creatorDiscoveryService.getDiscoveryRails(req.userId || null, {
      limit: parseInt(req.query.limit, 10) || 12,
    });
    res.json({ success: true, data });
  } catch (e) {
    console.error('discoverRails error:', e);
    res.status(500).json({ success: false, message: 'Failed to load discovery' });
  }
}

async function clientMetrics(req, res) {
  try {
    const clientMetricsService = require('../services/clientMetricsService');
    const data = await clientMetricsService.ingestClientMetrics(req.userId || null, req.body || {}, {
      path: req.headers.referer || req.get?.('referer') || '',
      ua: req.headers['user-agent'] || '',
    });
    res.json({ success: true, data });
  } catch (e) {
    console.warn('clientMetrics error:', e.message);
    res.status(200).json({ success: true, data: { accepted: 0 } });
  }
}

async function creatorAnalytics(req, res) {
  try {
    const targetId = String(req.params.userId || '');
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'userId required' });
    }
    if (String(req.userId) !== targetId) {
      return res.status(403).json({ success: false, message: 'You can only view your own analytics' });
    }
    const creatorAnalyticsService = require('../services/creatorAnalyticsService');
    const data = await creatorAnalyticsService.getCreatorAnalytics(targetId, {
      period: req.query.period || 'week',
    });
    res.json({ success: true, data });
  } catch (e) {
    console.error('creatorAnalytics error:', e);
    res.status(500).json({ success: false, message: 'Failed to load analytics' });
  }
}

async function listGiftCatalog(_req, res) {
  const giftService = require('../services/giftService');
  const rows = await giftService.getActiveCatalog();
  res.json({ success: true, data: rows });
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
  try {
    const viewerId = req.userId || uid(req) || null;
    const data = await socialFeedService.listFeed(viewerId, {
      limit: parseInt(req.query.limit, 10) || 30,
      offset: parseInt(req.query.offset, 10) || 0,
      userId: req.query.userId || req.query.user_id || null,
      feed: req.query.feed || req.query.scope || null,
      mediaType: req.query.mediaType || req.query.media_type || 'all',
    });
    const meta = {};
    if (req.query.userId || req.query.user_id) {
      meta.counts = await socialFeedService.getCreatorPostCounts(
        req.query.userId || req.query.user_id,
        viewerId
      );
    }
    /* Attach LIVE status for authors (feed pills) */
    try {
      const authorIds = [...new Set(data.map((p) => p.user_id || p.author?.id).filter(Boolean))];
      if (authorIds.length) {
        const liveMap = await discoverCreatorService.getLiveStatusForUsers(authorIds);
        data.forEach((p) => {
          const aid = String(p.user_id || p.author?.id || '');
          const live = liveMap.get(aid);
          p.author_live = live || null;
        });
      }
    } catch (_e) {
      /* non-fatal */
    }
    res.json({ success: true, data, meta: Object.keys(meta).length ? meta : undefined });
  } catch (e) {
    console.error('listPosts error:', e);
    res.status(500).json({ success: false, message: 'Failed to load posts' });
  }
}

async function createPost(req, res) {
  try {
    const body = req.body || {};
    const post = await socialFeedService.createPost(uid(req), {
      body: body.body || body.caption || body.text || '',
      mediaUrl: body.mediaUrl || body.media_url || null,
      thumbUrl: body.thumbUrl || body.thumb_url || null,
      mediaType: body.mediaType || body.media_type || null,
      visibility: body.visibility || 'public',
      aspectRatio: body.aspectRatio || body.aspect_ratio || 'original',
    });
    res.status(201).json({ success: true, data: post });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function uploadPostMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No media file uploaded' });
    }
    const isVideo = String(req.file.mimetype || '').startsWith('video/');
    const rel = `/uploads/social/${req.file.filename}`;
    res.status(201).json({
      success: true,
      data: {
        url: rel,
        mediaUrl: rel,
        mediaType: isVideo ? 'video' : 'image',
        mimeType: req.file.mimetype,
        size: req.file.size,
        originalName: req.file.originalname,
      },
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || 'Upload failed' });
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

async function getPostLikes(req, res) {
  try {
    const data = await socialFeedService.listPostLikers(req.params.postId, {
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || 'Failed to load likes' });
  }
}

async function commentPost(req, res) {
  try {
    const data = await socialFeedService.addComment(req.params.postId, uid(req), req.body.body, {
      parentId: req.body.parent_id || req.body.parentId || null,
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function getComments(req, res) {
  const data = await socialFeedService.listComments(req.params.postId, {
    limit: parseInt(req.query.limit, 10) || 50,
    offset: parseInt(req.query.offset, 10) || 0,
    viewerId: uid(req),
  });
  res.json({ success: true, data });
}

async function likeComment(req, res) {
  try {
    const data = await socialFeedService.toggleCommentLike(req.params.commentId, uid(req));
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function deleteComment(req, res) {
  try {
    const data = await socialFeedService.deleteComment(req.params.commentId, uid(req), {
      role: req.userRole,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function sharePost(req, res) {
  const data = await socialFeedService.sharePost(req.params.postId);
  res.json({ success: true, data });
}

async function deletePost(req, res) {
  try {
    const data = await socialFeedService.deletePost(req.params.postId, uid(req), {
      role: req.userRole,
    });
    res.json({ success: true, data });
  } catch (e) {
    const denied = /not allowed/i.test(String(e.message || ''));
    res.status(denied ? 403 : 400).json({ success: false, message: e.message });
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
    const data = await coinSellerService.exchangeSellerCoins(
      uid(req),
      req.body.coins ?? req.body.beans ?? req.body.amount
    );
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
  blockUser,
  unblockUser,
  blockStatus,
  myBlocked,
  myFollowing,
  userFollowing,
  userFollowers,
  followStats,
  liveFollowing,
  discoverCreators,
  discoverRails,
  clientMetrics,
  creatorEngagement,
  creatorProfilePanel,
  creatorSupporters,
  creatorBadges,
  creatorAnalytics,
  listGiftCatalog,
  listCoinSellers,
  buyFromSeller,
  uploadSellerProof,
  approveSellerOrder,
  rejectSellerOrder,
  mySellerOrders,
  listPosts,
  createPost,
  uploadPostMedia,
  likePost,
  getPostLikes,
  commentPost,
  getComments,
  likeComment,
  deleteComment,
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
