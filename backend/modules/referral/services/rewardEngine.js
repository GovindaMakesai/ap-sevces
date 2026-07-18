const db = require('../../../config/database');
const walletService = require('../../../services/walletService');

const ACTIVE_REWARD_STATUSES = ['pending', 'scheduled', 'approved', 'paid'];

/** Face-verify / signup base types — permanently blocked. Points only via stream missions (2h+). */
const BLOCKED_FACE_REWARD_TYPES = new Set(['validated', 'host_convert', 'signup', 'bonus']);

/**
 * Invite rewards credit POINTS (star_balance), never spendable NR coins.
 * Always stay pending until the user taps Receive (manual claim).
 * Amounts are still stored on referral_rewards.coins for UI totals.
 */
async function createReward({
  beneficiaryId,
  beneficiaryRole = 'inviter',
  referralId = null,
  rewardType = 'signup',
  coins = 0,
  stars = 0,
  metadata = {},
  client = null,
}) {
  const q = client || db;
  const type = String(rewardType || '').toLowerCase();
  if (BLOCKED_FACE_REWARD_TYPES.has(type)) {
    /* Strict: never create face/download invite point rows */
    return null;
  }
  const amount = Number(coins) || Number(stars) || 0;
  if (amount <= 0) return null;

  /* Hard dedupe: one active row per referral + beneficiary + reward_type
     (+ mission_slug for task rewards so each invite task can pay once) */
  if (referralId && rewardType) {
    const missionSlug = metadata?.mission_slug || metadata?.missionSlug || null;
    let existing;
    if (rewardType === 'mission' && missionSlug) {
      existing = await q.query(
        `SELECT * FROM referral_rewards
         WHERE referral_id = $1
           AND beneficiary_id = $2
           AND reward_type = $3
           AND status = ANY($4::text[])
           AND metadata->>'mission_slug' = $5
         ORDER BY created_at ASC
         LIMIT 1`,
        [referralId, beneficiaryId, rewardType, ACTIVE_REWARD_STATUSES, String(missionSlug)]
      );
    } else {
      existing = await q.query(
        `SELECT * FROM referral_rewards
         WHERE referral_id = $1
           AND beneficiary_id = $2
           AND reward_type = $3
           AND status = ANY($4::text[])
         ORDER BY created_at ASC
         LIMIT 1`,
        [referralId, beneficiaryId, rewardType, ACTIVE_REWARD_STATUSES]
      );
    }
    if (existing.rows[0]) return existing.rows[0];
  }

  /* Always pending until user taps Receive — never auto-credit wallet */
  const status = 'pending';
  const scheduledFor = null;
  const approvalMode = 'manual';

  const res = await q.query(
    `INSERT INTO referral_rewards
       (referral_id, beneficiary_id, beneficiary_role, reward_type, coins, stars,
        status, approval_mode, scheduled_for, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      referralId,
      beneficiaryId,
      beneficiaryRole,
      rewardType,
      amount,
      0,
      status,
      approvalMode,
      scheduledFor,
      JSON.stringify({ ...metadata, credit_as: 'points' }),
    ]
  );
  return res.rows[0];
}

async function payReward(rewardId, { client = null, force = false } = {}) {
  const ownClient = !client;
  const c = client || (await db.pool.connect());
  try {
    if (ownClient) await c.query('BEGIN');
    const res = await c.query(`SELECT * FROM referral_rewards WHERE id = $1 FOR UPDATE`, [rewardId]);
    const reward = res.rows[0];
    if (!reward) throw new Error('Reward not found');
    if (BLOCKED_FACE_REWARD_TYPES.has(String(reward.reward_type || '').toLowerCase())) {
      await c.query(
        `UPDATE referral_rewards SET status = 'rejected', updated_at = CURRENT_TIMESTAMP,
           metadata = COALESCE(metadata, '{}'::jsonb) ||
             '{"rejected_reason":"strict_no_points_until_2h_stream"}'::jsonb
         WHERE id = $1`,
        [rewardId]
      );
      throw new Error('Invite points require 2 hours of streaming');
    }
    if (reward.status === 'paid') return reward;
    if (reward.status === 'rejected' || reward.status === 'held') {
      throw new Error(`Reward is ${reward.status}`);
    }
    if (!force && reward.status === 'pending') {
      throw new Error('Reward requires claim');
    }
    if (!force && !['approved', 'scheduled'].includes(reward.status)) {
      throw new Error('Reward not payable');
    }
    if (reward.status === 'scheduled' && reward.scheduled_for && new Date(reward.scheduled_for) > new Date()) {
      throw new Error('Reward not due yet');
    }

    const amount = Number(reward.coins || reward.stars || 0);
    let walletTx = null;
    if (amount > 0) {
      /* Points only — never add invite rewards to spendable coin_balance */
      const credited = await walletService.creditStars(
        reward.beneficiary_id,
        amount,
        {
          type: 'referral_reward',
          reference_type: 'referral_reward',
          reference_id: reward.id,
          metadata: {
            reward_type: reward.reward_type,
            referral_id: reward.referral_id,
            source: 'modules/referral',
            credit_as: 'points',
          },
        },
        c
      );
      walletTx = credited?.transaction?.id || null;
    }

    await c.query(
      `INSERT INTO reward_transactions (user_id, source, source_id, coins, stars, wallet_reference, note)
       VALUES ($1, 'referral', $2, 0, $3, $4, $5)`,
      [
        reward.beneficiary_id,
        reward.id,
        amount,
        walletTx,
        reward.reward_type,
      ]
    );

    await c.query(
      `INSERT INTO host_statistics (user_id, referral_reward_coins, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         referral_reward_coins = host_statistics.referral_reward_coins + EXCLUDED.referral_reward_coins,
         updated_at = CURRENT_TIMESTAMP`,
      [reward.beneficiary_id, amount]
    );

    const paid = await c.query(
      `UPDATE referral_rewards SET status = 'paid', paid_at = CURRENT_TIMESTAMP,
         wallet_tx_id = $2, updated_at = CURRENT_TIMESTAMP,
         metadata = COALESCE(metadata, '{}'::jsonb) || '{"credit_as":"points"}'::jsonb
       WHERE id = $1 RETURNING *`,
      [rewardId, walletTx]
    );

    if (ownClient) await c.query('COMMIT');
    return paid.rows[0];
  } catch (err) {
    if (ownClient) await c.query('ROLLBACK');
    throw err;
  } finally {
    if (ownClient) c.release();
  }
}

async function processDueScheduled(limit = 50) {
  /* Do not auto-pay. Move due scheduled rows to pending so user must Receive → points. */
  const due = await db.query(
    `UPDATE referral_rewards
     SET status = 'pending', approval_mode = 'manual', updated_at = CURRENT_TIMESTAMP
     WHERE id IN (
       SELECT id FROM referral_rewards
       WHERE status = 'scheduled' AND scheduled_for <= CURRENT_TIMESTAMP
       ORDER BY scheduled_for ASC
       LIMIT $1
     )
     RETURNING id, status`,
    [limit]
  );
  return due.rows.map((row) => ({ id: row.id, ok: true, reward: row }));
}

async function approveReward(rewardId, adminId) {
  await db.query(
    `UPDATE referral_rewards SET status = 'approved', updated_at = CURRENT_TIMESTAMP,
       metadata = metadata || $2::jsonb
     WHERE id = $1 AND status IN ('pending', 'held')`,
    [rewardId, JSON.stringify({ approved_by: adminId, approved_at: new Date().toISOString() })]
  );
  return payReward(rewardId, { force: true });
}

async function rejectReward(rewardId, adminId, reason) {
  const res = await db.query(
    `UPDATE referral_rewards SET status = 'rejected', updated_at = CURRENT_TIMESTAMP,
       metadata = metadata || $2::jsonb
     WHERE id = $1 RETURNING *`,
    [rewardId, JSON.stringify({ rejected_by: adminId, reason: reason || null })]
  );
  return res.rows[0];
}

/**
 * Reject duplicate pending/approved/scheduled rows so one invite cannot pay 3×.
 * Keeps the oldest row per (referral_id, reward_type).
 */
async function collapseDuplicatePending(userId) {
  await db.query(
    `UPDATE referral_rewards r
     SET status = 'rejected',
         updated_at = CURRENT_TIMESTAMP,
         metadata = COALESCE(r.metadata, '{}'::jsonb) || '{"rejected_reason":"duplicate_collapsed"}'::jsonb
     WHERE r.beneficiary_id = $1
       AND r.status IN ('pending', 'approved', 'scheduled')
       AND r.referral_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM referral_rewards older
         WHERE older.referral_id = r.referral_id
           AND older.beneficiary_id = r.beneficiary_id
           AND older.reward_type = r.reward_type
           AND older.status = ANY($2::text[])
           AND older.created_at < r.created_at
           AND (
             r.reward_type <> 'mission'
             OR COALESCE(older.metadata->>'mission_slug','') = COALESCE(r.metadata->>'mission_slug','')
           )
       )`,
    [userId, ACTIVE_REWARD_STATUSES]
  );
}

async function claimPendingForUser(userId) {
  await collapseDuplicatePending(userId);

  /* Kill any leftover face-verify rows before Receive can pay them */
  await db.query(
    `UPDATE referral_rewards
     SET status = 'rejected',
         updated_at = CURRENT_TIMESTAMP,
         metadata = COALESCE(metadata, '{}'::jsonb) ||
           '{"rejected_reason":"strict_no_points_until_2h_stream"}'::jsonb
     WHERE beneficiary_id = $1
       AND status IN ('pending', 'approved', 'scheduled')
       AND paid_at IS NULL
       AND reward_type = ANY($2::text[])`,
    [userId, [...BLOCKED_FACE_REWARD_TYPES]]
  );

  const pending = await db.query(
    `SELECT id FROM referral_rewards
     WHERE beneficiary_id = $1
       AND status IN ('pending', 'approved', 'scheduled')
       AND reward_type <> ALL($2::text[])
       AND (scheduled_for IS NULL OR scheduled_for <= CURRENT_TIMESTAMP)
     ORDER BY created_at ASC LIMIT 50`,
    [userId, [...BLOCKED_FACE_REWARD_TYPES]]
  );
  const paid = [];
  for (const row of pending.rows) {
    try {
      paid.push(await payReward(row.id, { force: true }));
    } catch (_e) {
      /* skip individual failures */
    }
  }
  return paid;
}

module.exports = {
  createReward,
  payReward,
  processDueScheduled,
  approveReward,
  rejectReward,
  claimPendingForUser,
  collapseDuplicatePending,
  ACTIVE_REWARD_STATUSES,
  BLOCKED_FACE_REWARD_TYPES,
};
