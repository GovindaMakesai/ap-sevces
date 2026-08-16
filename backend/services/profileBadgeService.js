const cpService = require('./cpService');
const svipService = require('./svipService');
const vipService = require('./vipService');
const coinSellerService = require('./coinSellerService');
const db = require('../config/database');

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

  return {
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
}

module.exports = { getProfileBadges };
