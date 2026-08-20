const cpService = require('./cpService');
const svipService = require('./svipService');
const vipService = require('./vipService');
const coinSellerService = require('./coinSellerService');
const db = require('../config/database');

const BADGE_TTL_MS = 45000;
const badgeCache = new Map();

async function getProfileBadges(userId) {
  if (!userId) {
    return {
      personalLevel: 1,
      svipLevel: 0,
      svipLabel: null,
      isSvip: false,
      vipLevel: null,
      vipLabel: null,
      role: null,
      is_coin_seller: false,
    };
  }

  const cacheKey = String(userId);
  const hit = badgeCache.get(cacheKey);
  if (hit && Date.now() - hit.at < BADGE_TTL_MS) return hit.data;

  const [levelRes, svipHome, vipMembership, userRow, sellerProfile] = await Promise.all([
    cpService.getPersonalLevel(userId).catch(() => ({ level: 1 })),
    svipService.getSvipHome(userId).catch(() => ({ level: 0, isSvip: false, levelLabel: null })),
    vipService.getMembership(userId).catch(() => null),
    db.query(`SELECT role FROM users WHERE id = $1`, [userId]).catch(() => ({ rows: [] })),
    coinSellerService.getProfile(userId).catch(() => null),
  ]);

  const role = userRow.rows[0]?.role || null;
  const isCoinSeller =
    role === 'coin_seller' || Boolean(sellerProfile && sellerProfile.is_active !== false);

  const svipLevel = Number(svipHome.level) || 0;
  const vipLevel =
    vipMembership?.vip_level_num != null ? Number(vipMembership.vip_level_num) : null;
  const vipLabel =
    vipMembership?.level_name ||
    (vipLevel != null && vipLevel > 0 ? `VIP ${vipLevel}` : null);

  const data = {
    personalLevel: Number(levelRes.level) || 1,
    svipLevel,
    svipLabel: svipLevel > 0 ? svipHome.levelLabel || `SVIP ${svipLevel}` : null,
    isSvip: svipLevel > 0,
    svipPointsFormatted: svipHome.pointsFormatted || null,
    vipLevel: vipLevel != null && vipLevel > 0 ? vipLevel : null,
    vipLabel: vipLevel != null && vipLevel > 0 ? vipLabel : null,
    role,
    is_coin_seller: isCoinSeller,
  };
  badgeCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

module.exports = { getProfileBadges };
