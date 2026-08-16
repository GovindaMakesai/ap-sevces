const db = require('../config/database');

/** 1 diamond (coin) purchased via recharge = 1 SVIP point */
const SVIP_LEVELS = [
  { level: 0, min: 0, max: 3000000 },
  { level: 1, min: 3000000, max: 4500000 },
  { level: 2, min: 4500000, max: 6000000 },
  { level: 3, min: 6000000, max: 9000000 },
  { level: 4, min: 9000000, max: 12000000 },
  { level: 5, min: 12000000, max: 17000000 },
  { level: 6, min: 17000000, max: 22000000 },
  { level: 7, min: 22000000, max: 33000000 },
  { level: 8, min: 33000000, max: 53000000 },
  { level: 9, min: 53000000, max: 85000000 },
  { level: 10, min: 85000000, max: 130000000 },
  { level: 11, min: 130000000, max: 200000000 },
  { level: 12, min: 200000000, max: 300000000 },
  { level: 13, min: 300000000, max: 400000000 },
  { level: 14, min: 400000000, max: 600000000 },
  { level: 15, min: 600000000, max: 800000000 },
  { level: 16, min: 800000000, max: 1100000000 },
  { level: 17, min: 1100000000, max: 1400000000 },
  { level: 18, min: 1400000000, max: null },
];

const SVIP_MAINTENANCE = [
  { level: 1, days: 7, points: 750000 },
  { level: 2, days: 7, points: 750000 },
  { level: 3, days: 7, points: 1500000 },
  { level: 4, days: 7, points: 1500000 },
  { level: 5, days: 10, points: 2500000 },
  { level: 6, days: 15, points: 4000000 },
  { level: 7, days: 15, points: 5000000 },
  { level: 8, days: 20, points: 10000000 },
  { level: 9, days: 20, points: 15000000 },
  { level: 10, days: 25, points: 25000000 },
  { level: 11, days: 25, points: 35000000 },
  { level: 12, days: 35, points: 50000000 },
  { level: 13, days: 45, points: 50000000 },
  { level: 14, days: 45, points: 100000000 },
  { level: 15, days: 60, points: 100000000 },
  { level: 16, days: 60, points: 150000000 },
  { level: 17, days: 60, points: 150000000 },
  { level: 18, days: 60, points: 200000000 },
];

const IDENTIFICATION = [
  { id: 'tag', name: 'SVIP Tag', minLevel: 1, icon: 'fa-tag' },
  { id: 'badge', name: 'SVIP Badge', minLevel: 1, icon: 'fa-award', animated: true },
  { id: 'entry', name: 'Entry Tag', minLevel: 1, icon: 'fa-door-open', animated: true },
  { id: 'profile_card', name: 'Profile Card', minLevel: 2, icon: 'fa-id-card', animated: true },
  { id: 'frame', name: 'SVIP Frame', minLevel: 3, icon: 'fa-circle-notch', animated: true },
  { id: 'bubble', name: 'SVIP Chat Bubble', minLevel: 4, icon: 'fa-comment-dots', animated: true },
  { id: 'medal', name: 'SVIP Medal', minLevel: 5, icon: 'fa-medal' },
  { id: 'ride', name: 'Entry Effect', minLevel: 6, icon: 'fa-car-side', animated: true },
  { id: 'theme', name: 'Profile Theme', minLevel: 8, icon: 'fa-palette' },
];

const PRIVILEGES = [
  { id: 'visitors', name: 'Visitors', minLevel: 1, icon: 'fa-users' },
  { id: 'svip_gifts', name: 'SVIP Gifts', minLevel: 1, icon: 'fa-gift' },
  { id: 'online_user', name: 'Online User', minLevel: 1, icon: 'fa-clock' },
  { id: 'svip_emoji', name: 'SVIP Emoji', minLevel: 1, icon: 'fa-smile' },
  { id: 'block_strangers', name: 'Block messages from strangers', minLevel: 1, icon: 'fa-shield-alt', toggle: true },
  { id: 'upgrade_notify', name: 'Upgrade notification', minLevel: 5, icon: 'fa-rocket' },
  { id: 'colorful_id', name: 'Colorful ID', minLevel: 10, icon: 'fa-palette' },
  { id: 'anon_visitor', name: 'Anonymous Visitor', minLevel: 5, icon: 'fa-user-secret', toggle: true },
  { id: 'hide_gifts', name: 'Hide Gift Record', minLevel: 8, icon: 'fa-eye-slash', toggle: true },
  { id: 'rank_stealth', name: 'Rank Stealth Mode', minLevel: 10, icon: 'fa-user-ninja', toggle: true },
  { id: 'more_admin', name: 'More Admin', minLevel: 10, icon: 'fa-user-plus' },
  { id: 'announcement', name: 'Upgraded Announcement', minLevel: 11, icon: 'fa-bullhorn' },
  { id: 'support', name: 'SVIP Customer Support', minLevel: 11, icon: 'fa-headset' },
  { id: 'dynamic_avatar', name: 'Dynamic Profile Picture', minLevel: 7, icon: 'fa-star' },
  { id: 'invisible_svip', name: 'Invisible SVIP', minLevel: 12, icon: 'fa-eye-slash', toggle: true },
  { id: 'anti_kick', name: 'Anti-Kick', minLevel: 13, icon: 'fa-ban', toggle: true },
  { id: 'room_theme', name: 'Customized room theme', minLevel: 14, icon: 'fa-home' },
  { id: 'unique_room_id', name: 'Unique Room ID', minLevel: 14, icon: 'fa-hashtag' },
  { id: 'msg_ban_shield', name: 'Avoid Messages Bans', minLevel: 14, icon: 'fa-comment-slash', toggle: true },
];

function levelFromPoints(points) {
  const pts = Math.max(0, Number(points) || 0);
  let current = SVIP_LEVELS[0];
  for (const row of SVIP_LEVELS) {
    if (pts >= row.min) current = row;
  }
  return current;
}

function formatCompact(n) {
  const v = Number(n || 0);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
}

/** SVIP points = approved wallet recharges + coin seller purchases/transfers + seller stock top-ups. */
async function getSvipPoints(userId) {
  const safeSum = async (sql, params) => {
    try {
      const res = await db.query(sql, params);
      return Number(res.rows[0]?.pts || res.rows[0]?.v || 0);
    } catch (_e) {
      return 0;
    }
  };

  const [rechargePts, sellerTransferPts, sellerOrderPts, sellerStockPts, walletRechargePts, walletTransferPts] =
    await Promise.all([
      safeSum(
        `SELECT COALESCE(SUM(coins_credited), 0)::bigint AS pts
         FROM recharges
         WHERE user_id = $1 AND payment_status = 'approved'`,
        [userId]
      ),
      safeSum(
        `SELECT COALESCE(SUM(coins), 0)::bigint AS pts
         FROM coin_seller_transfers
         WHERE recipient_id = $1`,
        [userId]
      ),
      safeSum(
        `SELECT COALESCE(SUM(coins), 0)::bigint AS pts
         FROM coin_seller_orders
         WHERE buyer_id = $1 AND status = 'completed'`,
        [userId]
      ),
      safeSum(
        `SELECT COALESCE(SUM(package_coins), 0)::bigint AS pts
         FROM coin_seller_recharges
         WHERE seller_id = $1 AND status = 'approved'`,
        [userId]
      ),
      safeSum(
        `SELECT COALESCE(SUM(amount), 0)::bigint AS pts
         FROM wallet_transactions
         WHERE user_id = $1 AND type = 'recharge' AND amount > 0`,
        [userId]
      ),
      safeSum(
        `SELECT COALESCE(SUM(amount), 0)::bigint AS pts
         FROM wallet_transactions
         WHERE user_id = $1 AND amount > 0
           AND type IN ('coin_seller_transfer', 'coin_seller_purchase')`,
        [userId]
      ),
    ]);

  const transferPts = Math.max(sellerTransferPts, walletTransferPts);
  let pts = rechargePts + transferPts + sellerOrderPts + sellerStockPts;
  if (pts === 0) {
    pts = walletRechargePts;
  }
  return pts;
}

function maintenanceForLevel(level) {
  const lv = Number(level) || 0;
  return SVIP_MAINTENANCE.find((m) => m.level === lv) || null;
}

/** SVIP-qualifying purchases since a timestamp (same sources as lifetime points). */
async function getQualifyingPointsSince(userId, since) {
  const sinceIso =
    since instanceof Date ? since.toISOString() : since ? String(since) : null;
  if (!sinceIso) return 0;

  const safeSum = async (sql, params) => {
    try {
      const res = await db.query(sql, params);
      return Number(res.rows[0]?.pts || 0);
    } catch (_e) {
      return 0;
    }
  };

  const [rechargePts, sellerTransferPts, sellerOrderPts, sellerStockPts, walletTransferPts] = await Promise.all([
    safeSum(
      `SELECT COALESCE(SUM(coins_credited), 0)::bigint AS pts
       FROM recharges
       WHERE user_id = $1 AND payment_status = 'approved' AND created_at >= $2`,
      [userId, sinceIso]
    ),
    safeSum(
      `SELECT COALESCE(SUM(coins), 0)::bigint AS pts
       FROM coin_seller_transfers
       WHERE recipient_id = $1 AND created_at >= $2`,
      [userId, sinceIso]
    ),
    safeSum(
      `SELECT COALESCE(SUM(coins), 0)::bigint AS pts
       FROM coin_seller_orders
       WHERE buyer_id = $1 AND status = 'completed' AND updated_at >= $2`,
      [userId, sinceIso]
    ),
    safeSum(
      `SELECT COALESCE(SUM(package_coins), 0)::bigint AS pts
       FROM coin_seller_recharges
       WHERE seller_id = $1 AND status = 'approved' AND updated_at >= $2`,
      [userId, sinceIso]
    ),
    safeSum(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS pts
       FROM wallet_transactions
       WHERE user_id = $1 AND amount > 0
         AND type IN ('coin_seller_transfer', 'coin_seller_purchase')
         AND created_at >= $2`,
      [userId, sinceIso]
    ),
  ]);

  const transferPts = Math.max(sellerTransferPts, walletTransferPts);
  let pts = rechargePts + transferPts + sellerOrderPts + sellerStockPts;
  if (pts === 0) {
    pts = await safeSum(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS pts
       FROM wallet_transactions
       WHERE user_id = $1 AND type = 'recharge' AND amount > 0 AND created_at >= $2`,
      [userId, sinceIso]
    );
  }
  return pts;
}

async function getStatusRow(userId) {
  try {
    const res = await db.query(`SELECT * FROM user_svip_status WHERE user_id = $1`, [userId]);
    return res.rows[0] || null;
  } catch (_e) {
    return null;
  }
}

function daysBetweenCeil(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

async function upsertStatus(userId, level, periodStarted, periodEnds) {
  await db.query(
    `INSERT INTO user_svip_status (user_id, level, period_started_at, period_ends_at, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id)
     DO UPDATE SET
       level = EXCLUDED.level,
       period_started_at = EXCLUDED.period_started_at,
       period_ends_at = EXCLUDED.period_ends_at,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, level, periodStarted.toISOString(), periodEnds.toISOString()]
  );
  return getStatusRow(userId);
}

async function deleteStatus(userId) {
  try {
    await db.query(`DELETE FROM user_svip_status WHERE user_id = $1`, [userId]);
  } catch (_e) {
    /* non-fatal */
  }
}

/**
 * Reconcile maintained SVIP level vs lifetime points and maintenance windows.
 * Returns status row or null when not SVIP.
 */
async function syncSvipStatus(userId, pointsLevel) {
  const ptsLevel = Math.max(0, Number(pointsLevel) || 0);
  if (!userId || ptsLevel <= 0) {
    await deleteStatus(userId);
    return null;
  }

  const now = new Date();
  let row = await getStatusRow(userId);

  if (!row) {
    const maint = maintenanceForLevel(ptsLevel);
    const days = maint?.days || 7;
    const periodStarted = new Date(now);
    periodStarted.setUTCHours(0, 0, 0, 0);
    const ends = new Date(now.getTime() + days * 86400000);
    return upsertStatus(userId, ptsLevel, periodStarted, ends);
  }

  let level = Number(row.level) || 0;
  let periodStarted = new Date(row.period_started_at);
  let periodEnds = new Date(row.period_ends_at);

  if (ptsLevel > level) {
    level = ptsLevel;
    const maint = maintenanceForLevel(level);
    const days = maint?.days || 7;
    periodStarted = now;
    periodEnds = new Date(now.getTime() + days * 86400000);
    row = await upsertStatus(userId, level, periodStarted, periodEnds);
    return row;
  }

  if (ptsLevel < level) {
    level = ptsLevel;
    if (level <= 0) {
      await deleteStatus(userId);
      return null;
    }
    const maint = maintenanceForLevel(level);
    const days = maint?.days || 7;
    periodStarted = now;
    periodEnds = new Date(now.getTime() + days * 86400000);
    row = await upsertStatus(userId, level, periodStarted, periodEnds);
    return row;
  }

  while (level > 0 && periodEnds.getTime() <= now.getTime()) {
    const maint = maintenanceForLevel(level);
    const required = maint?.points || 0;
    const earned = await getQualifyingPointsSince(userId, periodStarted);
    if (earned >= required) {
      const days = maint?.days || 7;
      periodStarted = now;
      periodEnds = new Date(now.getTime() + days * 86400000);
      row = await upsertStatus(userId, level, periodStarted, periodEnds);
      break;
    }
    level -= 1;
    if (level <= 0) {
      await deleteStatus(userId);
      return null;
    }
    const nextMaint = maintenanceForLevel(level);
    const days = nextMaint?.days || 7;
    periodStarted = now;
    periodEnds = new Date(now.getTime() + days * 86400000);
    row = await upsertStatus(userId, level, periodStarted, periodEnds);
  }

  return row;
}

function buildMaintenancePayload(userId, statusRow) {
  if (!statusRow || Number(statusRow.level) <= 0) {
    return null;
  }
  const level = Number(statusRow.level);
  const maint = maintenanceForLevel(level);
  if (!maint) return null;

  const now = new Date();
  const periodStarted = new Date(statusRow.period_started_at);
  const periodEnds = new Date(statusRow.period_ends_at);
  const daysTotal = maint.days;
  const daysRemaining = daysBetweenCeil(now, periodEnds);
  const daysElapsed = Math.max(0, daysTotal - daysRemaining);

  return {
    level,
    daysTotal,
    daysRemaining,
    daysElapsed,
    periodStartedAt: periodStarted.toISOString(),
    periodEndsAt: periodEnds.toISOString(),
    pointsRequired: maint.points,
    pointsRequiredFormatted: formatCompact(maint.points),
  };
}

async function getSettings(userId) {
  const res = await db.query(`SELECT settings FROM user_svip_settings WHERE user_id = $1`, [userId]);
  return res.rows[0]?.settings || {};
}

async function saveSettings(userId, settings) {
  await db.query(
    `INSERT INTO user_svip_settings (user_id, settings, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id)
     DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP`,
    [userId, JSON.stringify(settings || {})]
  );
  return getSettings(userId);
}

async function refreshSvipStatusForUser(userId) {
  if (!userId) return null;
  const points = await getSvipPoints(userId);
  const pointsLevel = levelFromPoints(points).level;
  return syncSvipStatus(userId, pointsLevel);
}

function scheduleSvipRefresh(userId) {
  if (!userId) return;
  setImmediate(() => {
    refreshSvipStatusForUser(userId).catch((err) => {
      console.warn('[svip] refresh failed', userId, err?.message || err);
    });
  });
}

async function getSvipHome(userId) {
  const points = userId ? await getSvipPoints(userId) : 0;
  const pointsTier = levelFromPoints(points);
  const pointsLevel = pointsTier.level;

  const statusRow = userId ? await syncSvipStatus(userId, pointsLevel) : null;
  const effectiveLevel = statusRow ? Number(statusRow.level) || 0 : 0;
  const tier =
    SVIP_LEVELS.find((r) => r.level === effectiveLevel) ||
    (effectiveLevel > 0 ? pointsTier : SVIP_LEVELS[0]);
  const next = SVIP_LEVELS.find((r) => r.level === effectiveLevel + 1) || null;
  const settings = userId ? await getSettings(userId) : {};

  let profilePic = null;
  let name = 'You';
  if (userId) {
    const u = await db.query(`SELECT first_name, last_name, profile_pic FROM users WHERE id = $1`, [userId]);
    const row = u.rows[0];
    if (row) {
      name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'You';
      profilePic = row.profile_pic || null;
    }
  }

  const progressMin = effectiveLevel > 0 ? tier.min : pointsTier.min;
  const progressMax = next ? next.min : tier.max || tier.min + 1;
  const inTier = Math.max(0, points - progressMin);
  const tierSpan = Math.max(1, progressMax - progressMin);
  const pointsToNext = next ? Math.max(0, progressMax - points) : 0;

  let upgradeProgress = null;
  let upgradeHint = null;
  if (next) {
    const goal = next.min;
    upgradeProgress = {
      current: points,
      max: goal,
      currentFormatted: formatCompact(points),
      maxFormatted: formatCompact(goal),
      percent: Math.min(100, Math.round((points / goal) * 100)),
      goalLevel: next.level,
      goalLabel: `SVIP ${next.level}`,
    };
    upgradeHint = `Need ${pointsToNext.toLocaleString()} points to upgrade to SVIP ${next.level}.`;
  } else if (effectiveLevel <= 0) {
    const goal = SVIP_LEVELS[1]?.min || 3000000;
    const remaining = Math.max(0, goal - points);
    upgradeProgress = {
      current: points,
      max: goal,
      currentFormatted: formatCompact(points),
      maxFormatted: formatCompact(goal),
      percent: Math.min(100, Math.round((points / goal) * 100)),
      goalLevel: 1,
      goalLabel: 'SVIP 1',
    };
    upgradeHint = `Need ${remaining.toLocaleString()} points to upgrade to SVIP 1.`;
  } else {
    upgradeHint = 'You have reached the highest SVIP tier.';
  }

  let maintenance = null;
  if (statusRow && effectiveLevel > 0) {
    const base = buildMaintenancePayload(userId, statusRow);
    if (base) {
      const earned = await getQualifyingPointsSince(userId, statusRow.period_started_at);
      const required = base.pointsRequired;
      const remainingPts = Math.max(0, required - earned);
      maintenance = {
        ...base,
        pointsEarned: earned,
        pointsEarnedFormatted: formatCompact(earned),
        pointsRemaining: remainingPts,
        pointsRemainingFormatted: formatCompact(remainingPts),
        progressPercent: required > 0 ? Math.min(100, Math.round((earned / required) * 100)) : 100,
        isMet: earned >= required,
        daysLabel:
          base.daysRemaining <= 0
            ? 'Maintenance period ends today'
            : `${base.daysRemaining} day${base.daysRemaining === 1 ? '' : 's'} left`,
        dropLabel: `SVIP ${effectiveLevel} drops in ${base.daysRemaining} day${base.daysRemaining === 1 ? '' : 's'} if maintenance is not met`,
        summary: earned >= required
          ? `Maintenance met for SVIP ${effectiveLevel}. ${base.daysRemaining} day${base.daysRemaining === 1 ? '' : 's'} until the next period.`
          : `Recharge ${formatCompact(remainingPts)} more SVIP points in ${base.daysRemaining} day${base.daysRemaining === 1 ? '' : 's'} to keep SVIP ${effectiveLevel}.`,
      };
    }
  }

  return {
    points,
    pointsFormatted: formatCompact(points),
    pointsLevel,
    level: effectiveLevel,
    levelLabel: effectiveLevel > 0 ? `SVIP ${effectiveLevel}` : 'Not SVIP yet',
    isSvip: effectiveLevel > 0,
    nextLevel: next ? next.level : null,
    nextLevelLabel: next ? `SVIP ${next.level}` : null,
    pointsToNext,
    pointsToNextFormatted: formatCompact(pointsToNext),
    upgradeHint,
    upgradeProgress,
    progress: upgradeProgress || {
      current: inTier,
      max: tierSpan,
      currentFormatted: formatCompact(inTier),
      maxFormatted: formatCompact(tierSpan),
      percent: Math.min(100, Math.round((inTier / tierSpan) * 100)),
    },
    maintenance,
    user: { name, profilePic },
    identification: IDENTIFICATION,
    privileges: PRIVILEGES,
    settings,
    tierGroups: [
      { id: '1-2', label: 'SVIP 1-2', levels: [1, 2] },
      { id: '3-4', label: 'SVIP 3-4', levels: [3, 4] },
      { id: '5-6', label: 'SVIP 5-6', levels: [5, 6] },
      { id: '7-8', label: 'SVIP 7-8', levels: [7, 8] },
      { id: '9-10', label: 'SVIP 9-10', levels: [9, 10] },
      { id: '11-12', label: 'SVIP 11-12', levels: [11, 12] },
      { id: '13-14', label: 'SVIP 13-14', levels: [13, 14] },
      { id: '15-16', label: 'SVIP 15-16', levels: [15, 16] },
      { id: '17-18', label: 'SVIP 17-18', levels: [17, 18] },
    ],
  };
}

function getSvipIntro() {
  return {
    pointRule:
      '1 purchased diamond (coin) = 1 SVIP point: approved wallet recharges, coins received from coin sellers, completed seller orders, and approved seller stock top-ups. Exchanging earned points to coins or moving sell coins → gift coins does not add SVIP points.',
    levels: SVIP_LEVELS.map((r) => ({
      level: r.level,
      min: r.min,
      max: r.max,
      minFormatted: formatCompact(r.min),
      maxFormatted: r.max ? formatCompact(r.max) : '∞',
    })),
    maintenance: SVIP_MAINTENANCE,
    validityRules: [
      'Each SVIP level has a maintenance period. Recharge the required amount during this period to keep your level.',
      'Successful maintenance opens the next period. Recharges during maintenance also count toward upgrading.',
      'If maintenance fails, your level drops by one and points accumulate from that level’s minimum again.',
    ],
    notice: [
      'AP Services holds the final interpretation of SVIP rules.',
      'Stay tuned for more SVIP privileges coming soon.',
    ],
  };
}

module.exports = {
  SVIP_LEVELS,
  SVIP_MAINTENANCE,
  IDENTIFICATION,
  PRIVILEGES,
  getSvipHome,
  getSvipIntro,
  getSvipPoints,
  getQualifyingPointsSince,
  syncSvipStatus,
  refreshSvipStatusForUser,
  scheduleSvipRefresh,
  getSettings,
  saveSettings,
  levelFromPoints,
  maintenanceForLevel,
  formatCompact,
};
