const db = require('../../../config/database');
const settings = require('./settingsService');
const walletService = require('../../../services/walletService');

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

async function listActiveMissions() {
  const res = await db.query(
    `SELECT * FROM host_missions
     WHERE active = TRUE
       AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
       AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
     ORDER BY sort_order ASC, created_at ASC`
  );
  return res.rows;
}

async function getOrCreateProgress(userId, mission) {
  const key = periodKey(mission.period);
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

async function computeBroadcastHours(userId) {
  const res = await db.query(
    `SELECT COALESCE(SUM(counted_seconds),0)::bigint AS sec
     FROM broadcast_summary WHERE user_id = $1`,
    [userId]
  );
  return Number(res.rows[0]?.sec || 0) / 3600;
}

async function computeHostEarningsUsd(userId) {
  /* Approximate using stars / gift receipt in wallet meta — safe aggregate */
  const stars = await db.query(
    `SELECT COALESCE(star_balance,0)::bigint AS s FROM wallets WHERE user_id = $1`,
    [userId]
  ).catch(() => ({ rows: [{ s: 0 }] }));
  const ptsPerUsd = 10000;
  const gifted = await db.query(
    `SELECT COALESCE(SUM(coin_amount),0)::bigint AS c FROM gift_transactions WHERE receiver_id = $1`,
    [userId]
  ).catch(() => ({ rows: [{ c: 0 }] }));
  const giftUsd = Number(gifted.rows[0]?.c || 0) / 10000;
  const starUsd = Number(stars.rows[0]?.s || 0) / ptsPerUsd;
  return giftUsd + starUsd;
}

async function syncUserMissions(userId) {
  const missions = await listActiveMissions();
  const faceOk = await db.query(
    `SELECT face_verified_at, identity_verified_at, role FROM users WHERE id = $1`,
    [userId]
  );
  const user = faceOk.rows[0] || {};
  const isHost = ['creator', 'host', 'worker', 'admin', 'super_admin'].includes(
    String(user.role || '').toLowerCase()
  );
  const faceVerified = Boolean(user.face_verified_at || user.identity_verified_at);

  const hours = await computeBroadcastHours(userId);
  const earningsUsd = await computeHostEarningsUsd(userId);
  const out = [];

  for (const mission of missions) {
    if (mission.requires_host_role && !isHost) {
      out.push({ mission, progress: null, locked: true, reason: 'host_role_required' });
      continue;
    }
    if (mission.requires_face_verified && !faceVerified) {
      out.push({ mission, progress: null, locked: true, reason: 'face_verification_required' });
      continue;
    }

    let progress = await getOrCreateProgress(userId, mission);
    let value = Number(progress.progress_value || 0);
    if (mission.mission_type === 'broadcast_hours') value = hours;
    if (mission.mission_type === 'host_earnings_usd') value = earningsUsd;

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
    } else if (status === 'in_progress') {
      await db.query(
        `UPDATE mission_progress SET progress_value = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [progress.id, value]
      );
      progress = { ...progress, progress_value: value };
    }
    out.push({
      mission,
      progress,
      locked: false,
      percent: Math.min(100, Math.round((Number(progress.progress_value) / target) * 100)),
    });
  }
  return out;
}

async function claimMission(userId, missionId) {
  const missionRes = await db.query(`SELECT * FROM host_missions WHERE id = $1 AND active = TRUE`, [
    missionId,
  ]);
  const mission = missionRes.rows[0];
  if (!mission) throw Object.assign(new Error('Mission not found'), { status: 404 });

  await syncUserMissions(userId);
  const key = periodKey(mission.period);
  const prog = await db.query(
    `SELECT * FROM mission_progress WHERE mission_id = $1 AND user_id = $2 AND period_key = $3 FOR UPDATE`,
    [mission.id, userId, key]
  ).catch(async () =>
    db.query(
      `SELECT * FROM mission_progress WHERE mission_id = $1 AND user_id = $2 AND period_key = $3`,
      [mission.id, userId, key]
    )
  );
  const progress = prog.rows[0];
  if (!progress || progress.status !== 'completed') {
    throw Object.assign(new Error('Mission not completed yet'), { status: 400 });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const coins = Number(mission.reward_coins || 0);
    let walletTx = null;
    if (coins > 0) {
      const credited = await walletService.creditCoins(
        userId,
        coins,
        {
          type: 'mission_reward',
          reference_type: 'host_mission',
          reference_id: mission.id,
          metadata: { slug: mission.slug, module: 'referral' },
        },
        client
      );
      walletTx = credited?.transaction?.id || null;
    }

    await client.query(
      `INSERT INTO mission_rewards
         (mission_id, progress_id, user_id, coins, stars, status, paid_at, wallet_tx_id)
       VALUES ($1,$2,$3,$4,$5,'paid',CURRENT_TIMESTAMP,$6)`,
      [mission.id, progress.id, userId, coins, Number(mission.reward_stars || 0), walletTx]
    );
    await client.query(
      `INSERT INTO reward_transactions (user_id, source, source_id, coins, stars, wallet_reference, note)
       VALUES ($1,'mission',$2,$3,$4,$5,$6)`,
      [userId, mission.id, coins, Number(mission.reward_stars || 0), walletTx, mission.slug]
    );
    await client.query(
      `UPDATE mission_progress SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [progress.id]
    );
    await client.query(
      `INSERT INTO host_statistics (user_id, mission_reward_coins, updated_at)
       VALUES ($1,$2,CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         mission_reward_coins = host_statistics.mission_reward_coins + EXCLUDED.mission_reward_coins,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, coins]
    );
    await client.query('COMMIT');
    return { ok: true, coins, mission };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
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
  computeBroadcastHours,
};
