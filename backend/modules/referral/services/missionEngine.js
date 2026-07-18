const db = require('../../../config/database');
const settings = require('./settingsService');
const rewardEngine = require('./rewardEngine');

/** Invite-host tasks. Base 10,500 is broadcast_2h (not face-verify). */
const ALLOWED_MISSION_SLUGS = [
  'broadcast_2h',
  'broadcast_1h',
  'broadcast_5h',
  'broadcast_8h',
  'broadcast_12h',
  'earn_20_usd',
  'earn_50_usd',
  'earn_100_usd',
  'earn_200_usd',
];

const CANONICAL_MISSIONS = [
  {
    slug: 'broadcast_2h',
    title: 'Invited host broadcasts 2 hours within 7 days',
    description: 'Invited host to broadcast for 2 hours within 7 days',
    mission_type: 'broadcast_hours',
    target_value: 2,
    target_unit: 'hours',
    reward_coins: 10500,
    period: 'lifetime',
    sort_order: 5,
    config: { window_days: 7, daily_cap_hours: 3, pay_to: 'inviter', is_base_invite_reward: true },
  },
  {
    slug: 'broadcast_1h',
    title: 'Invited host broadcasts 1 hour within 7 days',
    description: 'Invited host to broadcast for 1 hour within 7 days',
    mission_type: 'broadcast_hours',
    target_value: 1,
    target_unit: 'hours',
    reward_coins: 10000,
    period: 'lifetime',
    sort_order: 10,
    config: { window_days: 7, daily_cap_hours: 3, pay_to: 'inviter' },
  },
  {
    slug: 'broadcast_5h',
    title: 'Invited host broadcasts 5 hours within 7 days',
    description: 'Invited host to broadcast for 5 hours within 7 days',
    mission_type: 'broadcast_hours',
    target_value: 5,
    target_unit: 'hours',
    reward_coins: 10000,
    period: 'lifetime',
    sort_order: 20,
    config: { window_days: 7, daily_cap_hours: 3, pay_to: 'inviter' },
  },
  {
    slug: 'broadcast_8h',
    title: 'Invited host broadcasts 8 hours within 7 days',
    description: 'Invited host to broadcast for 8 hours within 7 days',
    mission_type: 'broadcast_hours',
    target_value: 8,
    target_unit: 'hours',
    reward_coins: 10000,
    period: 'lifetime',
    sort_order: 30,
    config: { window_days: 7, daily_cap_hours: 3, pay_to: 'inviter' },
  },
  {
    slug: 'broadcast_12h',
    title: 'Invited host broadcasts 12 hours within 7 days',
    description: 'Invited host to broadcast for 12 hours within 7 days',
    mission_type: 'broadcast_hours',
    target_value: 12,
    target_unit: 'hours',
    reward_coins: 30000,
    period: 'lifetime',
    sort_order: 40,
    config: { window_days: 7, daily_cap_hours: 3, pay_to: 'inviter' },
  },
  {
    slug: 'earn_20_usd',
    title: "Invited host income reaches $20 within 30 days",
    description: "Invited host income reached $20 within 30 days (Doesn't include platform rewards)",
    mission_type: 'host_earnings_usd',
    target_value: 20,
    target_unit: 'usd',
    reward_coins: 10000,
    period: 'lifetime',
    sort_order: 50,
    config: { window_days: 30, pay_to: 'inviter', exclude_platform_rewards: true },
  },
  {
    slug: 'earn_50_usd',
    title: "Invited host income reaches $50 within 30 days",
    description: "Invited host's income reached $50 within 30 days (Doesn't include platform rewards)",
    mission_type: 'host_earnings_usd',
    target_value: 50,
    target_unit: 'usd',
    reward_coins: 20000,
    period: 'lifetime',
    sort_order: 60,
    config: { window_days: 30, pay_to: 'inviter', exclude_platform_rewards: true },
  },
  {
    slug: 'earn_100_usd',
    title: "Invited host earnings reach $100 within 30 days",
    description: "Invited host's earnings reached $100 within 30 days (Doesn't include platform rewards)",
    mission_type: 'host_earnings_usd',
    target_value: 100,
    target_unit: 'usd',
    reward_coins: 20000,
    period: 'lifetime',
    sort_order: 70,
    config: { window_days: 30, pay_to: 'inviter', exclude_platform_rewards: true },
  },
  {
    slug: 'earn_200_usd',
    title: "Invited host earnings reach $200 within 30 days",
    description: "Invited host's earnings reached $200 within 30 days (Doesn't include platform rewards)",
    mission_type: 'host_earnings_usd',
    target_value: 200,
    target_unit: 'usd',
    reward_coins: 30000,
    period: 'lifetime',
    sort_order: 80,
    config: { window_days: 30, pay_to: 'inviter', exclude_platform_rewards: true },
  },
];

function periodKey(period, d = new Date()) {
  if (period === 'daily') return d.toISOString().slice(0, 10);
  if (period === 'weekly') {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  if (period === 'monthly') return d.toISOString().slice(0, 7);
  return 'lifetime';
}

function missionConfig(mission) {
  const raw = mission?.config;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return {};
  }
}

async function ensureCanonicalMissions() {
  for (const m of CANONICAL_MISSIONS) {
    await db.query(
      `INSERT INTO host_missions
         (slug, title, description, mission_type, target_value, target_unit, reward_coins,
          reward_stars, reward_usd_equiv, period, sort_order, active, config,
          requires_face_verified, requires_host_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,'lifetime',$9,TRUE,$10::jsonb,TRUE,FALSE)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         mission_type = EXCLUDED.mission_type,
         target_value = EXCLUDED.target_value,
         target_unit = EXCLUDED.target_unit,
         reward_coins = EXCLUDED.reward_coins,
         reward_usd_equiv = EXCLUDED.reward_usd_equiv,
         period = 'lifetime',
         sort_order = EXCLUDED.sort_order,
         active = TRUE,
         config = EXCLUDED.config,
         requires_face_verified = TRUE,
         requires_host_role = FALSE,
         updated_at = CURRENT_TIMESTAMP`,
      [
        m.slug,
        m.title,
        m.description,
        m.mission_type,
        m.target_value,
        m.target_unit,
        m.reward_coins,
        m.target_value,
        m.sort_order,
        JSON.stringify(m.config || {}),
      ]
    );
  }
  /* Disable any other missions — only the guide tasks count */
  await db.query(
    `UPDATE host_missions
     SET active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE slug <> ALL($1::text[])`,
    [ALLOWED_MISSION_SLUGS]
  );
}

async function listActiveMissions() {
  await ensureCanonicalMissions().catch(() => {});
  const res = await db.query(
    `SELECT * FROM host_missions
     WHERE active = TRUE
       AND slug = ANY($1::text[])
       AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
       AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
     ORDER BY sort_order ASC, created_at ASC`,
    [ALLOWED_MISSION_SLUGS]
  );
  return res.rows;
}

async function getReferralForInvitee(inviteeId) {
  const res = await db.query(
    `SELECT * FROM referrals
     WHERE invitee_id = $1
       AND status IN ('valid', 'rewarded')
     ORDER BY COALESCE(validated_at, applied_at) DESC NULLS LAST
     LIMIT 1`,
    [inviteeId]
  );
  return res.rows[0] || null;
}

function windowBounds(referral, windowDays) {
  const start = new Date(referral.validated_at || referral.applied_at || referral.created_at || Date.now());
  const end = new Date(start.getTime() + Number(windowDays || 7) * 86400000);
  return { start, end };
}

async function computeBroadcastHoursInWindow(userId, start, end) {
  const res = await db.query(
    `SELECT COALESCE(SUM(counted_seconds),0)::bigint AS sec
     FROM broadcast_summary
     WHERE user_id = $1
       AND day >= $2::date
       AND day <= $3::date`,
    [userId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
  );
  return Number(res.rows[0]?.sec || 0) / 3600;
}

async function computeHostEarningsUsdInWindow(userId, start, end) {
  /* Host income = creator share of gifts only (excludes platform fee / platform rewards) */
  const gifted = await db
    .query(
      `SELECT COALESCE(SUM(creator_amount), 0)::float AS c
       FROM gift_transactions
       WHERE receiver_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [userId, start.toISOString(), end.toISOString()]
    )
    .catch(() => ({ rows: [{ c: 0 }] }));
  /* 10,000 gift coins ≈ $1 (same FX used elsewhere in referral module) */
  return Number(gifted.rows[0]?.c || 0) / 10000;
}

async function getOrCreateProgress(userId, mission, periodKeyValue) {
  const key = periodKeyValue || periodKey(mission.period);
  const existing = await db.query(
    `SELECT * FROM mission_progress WHERE mission_id = $1 AND user_id = $2 AND period_key = $3`,
    [mission.id, userId, key]
  );
  if (existing.rows[0]) return existing.rows[0];
  const res = await db.query(
    `INSERT INTO mission_progress (mission_id, user_id, progress_value, target_value, period_key, status)
     VALUES ($1,$2,0,$3,$4,'in_progress') RETURNING *`,
    [mission.id, userId, mission.target_value, key]
  );
  return res.rows[0];
}

/**
 * When invitee completes a task, create a pending POINTS reward for the inviter (Receive).
 */
async function grantInviterMissionReward({ referral, mission, inviteeId }) {
  const coins = Number(mission.reward_coins || 0);
  if (coins <= 0 || !referral?.inviter_id) return null;

  /* Strict gate for base 10,500: must have 2+ counted stream hours */
  if (String(mission.slug) === 'broadcast_2h') {
    const cfg = missionConfig(mission);
    const windowDays = Number(cfg.window_days || 7);
    const { start, end } = windowBounds(referral, windowDays);
    const hours = await computeBroadcastHoursInWindow(inviteeId, start, end);
    if (hours < 2) {
      return null;
    }
  }

  return rewardEngine.createReward({
    beneficiaryId: referral.inviter_id,
    beneficiaryRole: 'inviter',
    referralId: referral.id,
    rewardType: 'mission',
    coins,
    metadata: {
      mission_slug: mission.slug,
      mission_id: mission.id,
      invitee_id: inviteeId,
      credit_as: 'points',
      pay_to: 'inviter',
    },
  });
}

async function syncUserMissions(userId) {
  const missions = await listActiveMissions();
  const faceOk = await db.query(
    `SELECT face_verified_at, identity_verified_at, role FROM users WHERE id = $1`,
    [userId]
  );
  const user = faceOk.rows[0] || {};
  const faceVerified = Boolean(user.face_verified_at || user.identity_verified_at);
  const referral = await getReferralForInvitee(userId);
  const out = [];

  for (const mission of missions) {
    if (!ALLOWED_MISSION_SLUGS.includes(String(mission.slug))) continue;

    if (!referral) {
      out.push({ mission, progress: null, locked: true, reason: 'no_valid_invite' });
      continue;
    }
    if (mission.requires_face_verified && !faceVerified) {
      out.push({ mission, progress: null, locked: true, reason: 'face_verification_required' });
      continue;
    }

    const cfg = missionConfig(mission);
    const windowDays = Number(cfg.window_days || (mission.mission_type === 'broadcast_hours' ? 7 : 30));
    const { start, end } = windowBounds(referral, windowDays);
    const now = new Date();
    const expired = now > end;

    const pKey = `invite_${referral.id}`;
    let progress = await getOrCreateProgress(userId, mission, pKey);
    if (['claimed'].includes(String(progress.status))) {
      out.push({ mission, progress, locked: false, percent: 100, windowTo: 'inviter' });
      continue;
    }

    let value = Number(progress.progress_value || 0);
    if (!expired || progress.status === 'completed') {
      if (mission.mission_type === 'broadcast_hours') {
        value = await computeBroadcastHoursInWindow(userId, start, end);
      } else if (mission.mission_type === 'host_earnings_usd') {
        value = await computeHostEarningsUsdInWindow(userId, start, end);
      }
    }

    const target = Number(mission.target_value);
    let status = progress.status;

    if (status === 'in_progress' && value >= target) {
      status = 'completed';
      await db.query(
        `UPDATE mission_progress SET progress_value = $2, status = 'completed',
           completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [progress.id, value]
      );
      progress = { ...progress, progress_value: value, status, completed_at: new Date() };
      /* Create pending inviter points reward (manual Receive) — never auto-add coins */
      await grantInviterMissionReward({ referral, mission, inviteeId: userId });
      await db.query(
        `UPDATE mission_progress SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [progress.id]
      );
      progress = { ...progress, status: 'claimed', claimed_at: new Date() };
    } else if (status === 'in_progress') {
      if (expired) {
        await db.query(
          `UPDATE mission_progress SET progress_value = $2, status = 'expired', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [progress.id, value]
        );
        progress = { ...progress, progress_value: value, status: 'expired' };
      } else {
        await db.query(
          `UPDATE mission_progress SET progress_value = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [progress.id, value]
        );
        progress = { ...progress, progress_value: value };
      }
    }

    out.push({
      mission,
      progress,
      locked: false,
      percent: Math.min(100, Math.round((Number(progress.progress_value) / target) * 100)),
      window: { start, end, windowDays },
      rewardTo: 'inviter',
    });
  }
  return out;
}

/**
 * Invitee "claim" is no longer used to credit coins.
 * Completing a task already queues points for the inviter (Receive).
 */
async function claimMission(userId, missionId) {
  await syncUserMissions(userId);
  const missionRes = await db.query(`SELECT * FROM host_missions WHERE id = $1 AND active = TRUE`, [
    missionId,
  ]);
  const mission = missionRes.rows[0];
  if (!mission) throw Object.assign(new Error('Mission not found'), { status: 404 });
  if (!ALLOWED_MISSION_SLUGS.includes(String(mission.slug))) {
    throw Object.assign(new Error('This task is not part of the invite rewards'), { status: 400 });
  }

  const referral = await getReferralForInvitee(userId);
  if (!referral) {
    throw Object.assign(new Error('No valid invite on this account'), { status: 400 });
  }

  const prog = await db.query(
    `SELECT * FROM mission_progress
     WHERE mission_id = $1 AND user_id = $2 AND period_key = $3`,
    [mission.id, userId, `invite_${referral.id}`]
  );
  const progress = prog.rows[0];
  if (!progress || !['completed', 'claimed'].includes(String(progress.status))) {
    throw Object.assign(new Error('Mission not completed yet'), { status: 400 });
  }

  const reward = await grantInviterMissionReward({ referral, mission, inviteeId: userId });
  if (progress.status !== 'claimed') {
    await db.query(
      `UPDATE mission_progress SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [progress.id]
    );
  }

  return {
    ok: true,
    coins: 0,
    points: Number(mission.reward_coins || 0),
    pay_to: 'inviter',
    message: 'Reward queued for your inviter — they can tap Receive to get points',
    reward,
    mission,
  };
}

async function adminUpsertMission(payload, adminId) {
  if (payload.id) {
    const res = await db.query(
      `UPDATE host_missions SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         mission_type = COALESCE($4, mission_type),
         target_value = COALESCE($5, target_value),
         target_unit = COALESCE($6, target_unit),
         reward_coins = COALESCE($7, reward_coins),
         reward_stars = COALESCE($8, reward_stars),
         reward_usd_equiv = COALESCE($9, reward_usd_equiv),
         period = COALESCE($10, period),
         active = COALESCE($11, active),
         sort_order = COALESCE($12, sort_order),
         config = COALESCE($13, config),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [
        payload.id,
        payload.title,
        payload.description,
        payload.mission_type,
        payload.target_value,
        payload.target_unit,
        payload.reward_coins,
        payload.reward_stars,
        payload.reward_usd_equiv,
        payload.period,
        payload.active,
        payload.sort_order,
        payload.config ? JSON.stringify(payload.config) : null,
      ]
    );
    return res.rows[0];
  }
  const slug =
    payload.slug ||
    String(payload.title || 'mission')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 48) +
      '_' +
      Date.now().toString(36);
  const res = await db.query(
    `INSERT INTO host_missions
       (slug, title, description, mission_type, target_value, target_unit, reward_coins,
        reward_stars, reward_usd_equiv, period, sort_order, active, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12) RETURNING *`,
    [
      slug,
      payload.title || slug,
      payload.description || null,
      payload.mission_type || 'broadcast_hours',
      payload.target_value || 1,
      payload.target_unit || 'hours',
      payload.reward_coins || 0,
      payload.reward_stars || 0,
      payload.reward_usd_equiv || 0,
      payload.period || 'lifetime',
      payload.sort_order || 100,
      JSON.stringify(payload.config || {}),
    ]
  );
  return res.rows[0];
}

module.exports = {
  listActiveMissions,
  syncUserMissions,
  claimMission,
  adminUpsertMission,
  periodKey,
  computeBroadcastHours: async (userId) => computeBroadcastHoursInWindow(userId, new Date(0), new Date()),
  ensureCanonicalMissions,
  ALLOWED_MISSION_SLUGS,
  CANONICAL_MISSIONS,
};
