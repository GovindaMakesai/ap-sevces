const db = require('../config/database');
const profileVisitorService = require('./profileVisitorService');
const profileBadgeService = require('./profileBadgeService');
const cpService = require('./cpService');
const profileAlbumService = require('./profileAlbumService');

async function countMutualFriends(userId) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM user_follows f1
     INNER JOIN user_follows f2
       ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
     WHERE f1.follower_id = $1`,
    [userId]
  );
  return Number(res.rows[0]?.c || 0);
}

async function countProfileVisitors(userId) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS c FROM profile_visits WHERE profile_user_id = $1`,
    [userId]
  );
  return Number(res.rows[0]?.c || 0);
}

async function getGiftWall(receiverId, { limit = 64 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 64, 1), 100);
  const res = await db.query(
    `SELECT gift_type,
            COUNT(*)::int AS count,
            SUM(coin_amount)::bigint AS coins
     FROM gift_transactions
     WHERE receiver_id = $1
     GROUP BY gift_type
     ORDER BY count DESC, coins DESC
     LIMIT $2`,
    [receiverId, lim]
  );
  return res.rows.map((r) => ({
    giftType: r.gift_type,
    count: Number(r.count || 0),
    coins: Number(r.coins || 0),
  }));
}

async function getGiftStats(userId, { period = 'monthly' } = {}) {
  const id = String(userId || '').trim();
  if (!id) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodLabel = monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const sinceIso = monthStart.toISOString();

  const [receivedRes, sentRes, topSendersRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS gift_count,
              COALESCE(SUM(coin_amount), 0)::bigint AS gift_coins
       FROM gift_transactions
       WHERE receiver_id = $1 AND created_at >= $2`,
      [id, sinceIso]
    ),
    db.query(
      `SELECT COUNT(*)::int AS gift_count,
              COALESCE(SUM(coin_amount), 0)::bigint AS gift_coins
       FROM gift_transactions
       WHERE sender_id = $1 AND created_at >= $2`,
      [id, sinceIso]
    ),
    db.query(
      `SELECT gt.sender_id AS user_id,
              COUNT(*)::int AS gift_count,
              COALESCE(SUM(gt.coin_amount), 0)::bigint AS gift_coins,
              u.first_name, u.last_name, u.profile_pic, u.display_id, u.updated_at
       FROM gift_transactions gt
       JOIN users u ON u.id = gt.sender_id AND u.is_active = TRUE
       WHERE gt.receiver_id = $1 AND gt.created_at >= $2
       GROUP BY gt.sender_id, u.first_name, u.last_name, u.profile_pic, u.display_id, u.updated_at
       ORDER BY gift_coins DESC, gift_count DESC
       LIMIT 15`,
      [id, sinceIso]
    ),
  ]);

  const buildName = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'User';

  return {
    period: 'monthly',
    periodLabel,
    monthStart: sinceIso,
    received: {
      giftCount: Number(receivedRes.rows[0]?.gift_count || 0),
      giftCoins: Number(receivedRes.rows[0]?.gift_coins || 0),
    },
    sent: {
      giftCount: Number(sentRes.rows[0]?.gift_count || 0),
      giftCoins: Number(sentRes.rows[0]?.gift_coins || 0),
    },
    topSenders: topSendersRes.rows.map((r, i) => ({
      rank: i + 1,
      userId: String(r.user_id),
      displayName: buildName(r),
      profilePic: r.profile_pic || null,
      profileUpdatedAt: r.updated_at || null,
      displayId: r.display_id != null ? String(r.display_id) : null,
      giftCount: Number(r.gift_count || 0),
      giftCoins: Number(r.gift_coins || 0),
    })),
  };
}

function estimateAgeFromUser(row) {
  if (!row?.birth_date) return null;
  const d = new Date(row.birth_date);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age > 0 && age < 120 ? age : null;
}

function profileCompletionPct(user, links, albumCount = 0) {
  let score = 0;
  const checks = [
    Boolean(user?.profile_pic),
    Boolean(user?.bio && String(user.bio).trim()),
    Boolean(user?.first_name),
    Boolean(links?.instagram || links?.youtube || links?.website || links?.x),
    Boolean(user?.gender),
    Number(albumCount) > 0,
  ];
  checks.forEach((ok) => {
    if (ok) score += Math.floor(100 / checks.length);
  });
  return Math.min(100, score);
}

async function getProfilePanel(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;

  const userRes = await db.query(
    `SELECT id, first_name, last_name, profile_pic, bio, gender, role, display_id,
            is_verified, social_links, updated_at
     FROM users WHERE id = $1 AND is_active = TRUE`,
    [id]
  );
  const user = userRes.rows[0];
  if (!user) return null;

  let socialLinks = user.social_links || {};
  if (typeof socialLinks === 'string') {
    try {
      socialLinks = JSON.parse(socialLinks);
    } catch (_e) {
      socialLinks = {};
    }
  }

  const [badges, visitorSummary, friendsCount, visitorCount, giftWall, cpSummary, giftTotals, album, giftStats] =
    await Promise.all([
      profileBadgeService.getProfileBadges(id),
      profileVisitorService.getSummary(id).catch(() => null),
      countMutualFriends(id),
      countProfileVisitors(id),
      getGiftWall(id),
      cpService.getCpProfilePublic?.(id).catch(() => null),
      db.query(
        `SELECT COUNT(*)::int AS gift_count,
                COALESCE(SUM(coin_amount), 0)::bigint AS gift_coins
         FROM gift_transactions WHERE receiver_id = $1`,
        [id]
      ),
      profileAlbumService.getAlbum(id),
      getGiftStats(id, { period: 'monthly' }),
    ]);

  const giftCount = Number(giftTotals.rows[0]?.gift_count || 0);
  const giftCoins = Number(giftTotals.rows[0]?.gift_coins || 0);
  const personalLevel = await cpService.getPersonalLevel(id).catch(() => ({ level: 1 }));

  return {
    userId: id,
    displayId: user.display_id != null ? String(user.display_id) : null,
    displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User',
    profilePic: user.profile_pic || null,
    profileUpdatedAt: user.updated_at || null,
    bio: user.bio || null,
    gender: user.gender || null,
    age: estimateAgeFromUser(user),
    countryCode: null,
    role: user.role || null,
    isVerified: Boolean(user.is_verified),
    socialLinks,
    badges,
    personalLevel: Number(personalLevel?.level) || badges.personalLevel || 1,
    friendsCount,
    visitorCount,
    visitorSummary,
    giftCount,
    giftCoins,
    giftWall,
    giftStats,
    album,
    albumCount: album.length,
    profileCompletion: profileCompletionPct(user, socialLinks, album.length),
    cp: cpSummary
      ? {
          hasCp: Boolean(cpSummary.partner || cpSummary.cpLevel),
          cpLevel: cpSummary.cpLevel || cpSummary.level || 0,
          partnerName: cpSummary.partner?.name || null,
        }
      : null,
  };
}

module.exports = {
  getProfilePanel,
  getGiftWall,
  getGiftStats,
  countMutualFriends,
  countProfileVisitors,
};
