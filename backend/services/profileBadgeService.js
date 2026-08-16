const cpService = require('./cpService');
const svipService = require('./svipService');
const vipService = require('./vipService');

async function getProfileBadges(userId) {
  if (!userId) {
    return {
      personalLevel: 1,
      svipLevel: 0,
      svipLabel: null,
      isSvip: false,
      vipLevel: null,
      vipLabel: null,
    };
  }

  const [levelRes, svipHome, vipMembership] = await Promise.all([
    cpService.getPersonalLevel(userId).catch(() => ({ level: 1 })),
    svipService.getSvipHome(userId).catch(() => ({ level: 0, isSvip: false, levelLabel: null })),
    vipService.getMembership(userId).catch(() => null),
  ]);

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
  };
}

module.exports = { getProfileBadges };
