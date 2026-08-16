const db = require('../config/database');

async function getLevels() {
  const res = await db.query(`SELECT * FROM vip_levels ORDER BY level ASC`);
  return res.rows;
}

async function getMembership(userId) {
  const res = await db.query(
    `SELECT vm.*, vl.name AS level_name, vl.level AS vip_level_num, vl.perks, vl.badge_icon
     FROM vip_memberships vm JOIN vip_levels vl ON vl.id = vm.vip_level_id
     WHERE vm.user_id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function recalculateVip(userId, rechargeInrDelta = 0) {
  const levels = await getLevels();
  if (!levels.length) return null;

  let membership = await getMembership(userId);
  const totalInr = Number(membership?.total_recharge_inr || 0) + Number(rechargeInrDelta);

  let matched = levels[0];
  for (const lvl of levels) {
    if (totalInr >= Number(lvl.min_recharge_inr)) matched = lvl;
  }

  if (membership) {
    await db.query(
      `UPDATE vip_memberships SET vip_level_id = $1, total_recharge_inr = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $3`,
      [matched.id, totalInr, userId]
    );
  } else {
    await db.query(
      `INSERT INTO vip_memberships (user_id, vip_level_id, total_recharge_inr) VALUES ($1, $2, $3)`,
      [userId, matched.id, totalInr]
    );
  }

  if (Number(matched.level) >= 2) {
    await db.query(
      `UPDATE users SET role = CASE WHEN role = 'customer' THEN 'vip_user' ELSE role END WHERE id = $1`,
      [userId]
    );
  }

  return getMembership(userId);
}

async function hasVipAccess(userId, minLevel = 1) {
  const m = await getMembership(userId);
  if (!m) return false;
  const lvl = await db.query(`SELECT level FROM vip_levels WHERE id = $1`, [m.vip_level_id]);
  return Number(lvl.rows[0]?.level || 0) >= minLevel;
}

module.exports = { getLevels, getMembership, recalculateVip, hasVipAccess };
