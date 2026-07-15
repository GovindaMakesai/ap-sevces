const db = require('../../../config/database');
const walletService = require('../../../services/walletService');
const settings = require('./settingsService');

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
  const mode = String(await settings.getSetting('approval_mode', 'auto') || 'auto');
  const delayHours = Number(await settings.getSetting('reward_delay_hours', 0)) || 0;
  let status = 'pending';
  let scheduledFor = null;
  let approvalMode = mode;

  if (mode === 'delayed' || delayHours > 0) {
    status = 'scheduled';
    approvalMode = 'delayed';
    scheduledFor = new Date(Date.now() + delayHours * 3600 * 1000);
  } else if (mode === 'manual') {
    status = 'pending';
    approvalMode = 'manual';
  } else {
    status = 'approved';
    approvalMode = 'auto';
  }

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
      Number(coins) || 0,
      Number(stars) || 0,
      status,
      approvalMode,
      scheduledFor,
      JSON.stringify(metadata),
    ]
  );
  const reward = res.rows[0];
  if (status === 'approved') {
    return payReward(reward.id, { client });
  }
  return reward;
}

async function payReward(rewardId, { client = null, force = false } = {}) {
  const ownClient = !client;
  const c = client || (await db.pool.connect());
  try {
    if (ownClient) await c.query('BEGIN');
    const res = await c.query(`SELECT * FROM referral_rewards WHERE id = $1 FOR UPDATE`, [rewardId]);
    const reward = res.rows[0];
    if (!reward) throw new Error('Reward not found');
    if (reward.status === 'paid') return reward;
    if (!force && !['approved', 'scheduled'].includes(reward.status) && reward.approval_mode === 'manual') {
      throw new Error('Reward requires approval');
    }
    if (reward.status === 'scheduled' && reward.scheduled_for && new Date(reward.scheduled_for) > new Date()) {
      throw new Error('Reward not due yet');
    }
    if (reward.status === 'rejected' || reward.status === 'held') {
      throw new Error(`Reward is ${reward.status}`);
    }

    const coins = Number(reward.coins || 0);
    let walletTx = null;
    if (coins > 0) {
      const credited = await walletService.creditCoins(
        reward.beneficiary_id,
        coins,
        {
          type: 'referral_reward',
          reference_type: 'referral_reward',
          reference_id: reward.id,
          metadata: {
            reward_type: reward.reward_type,
            referral_id: reward.referral_id,
            source: 'modules/referral',
          },
        },
        c
      );
      walletTx = credited?.transaction?.id || null;
    }

    await c.query(
      `INSERT INTO reward_transactions (user_id, source, source_id, coins, stars, wallet_reference, note)
       VALUES ($1, 'referral', $2, $3, $4, $5, $6)`,
      [
        reward.beneficiary_id,
        reward.id,
        coins,
        Number(reward.stars || 0),
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
      [reward.beneficiary_id, coins]
    );

    const paid = await c.query(
      `UPDATE referral_rewards SET status = 'paid', paid_at = CURRENT_TIMESTAMP,
         wallet_tx_id = $2, updated_at = CURRENT_TIMESTAMP
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
  const due = await db.query(
    `SELECT id FROM referral_rewards
     WHERE status = 'scheduled' AND scheduled_for <= CURRENT_TIMESTAMP
     ORDER BY scheduled_for ASC LIMIT $1`,
    [limit]
  );
  const results = [];
  for (const row of due.rows) {
    try {
      results.push({ id: row.id, ok: true, reward: await payReward(row.id) });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: e.message });
    }
  }
  return results;
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

async function claimPendingForUser(userId) {
  const pending = await db.query(
    `SELECT id FROM referral_rewards
     WHERE beneficiary_id = $1 AND status IN ('approved', 'scheduled')
       AND (scheduled_for IS NULL OR scheduled_for <= CURRENT_TIMESTAMP)
     ORDER BY created_at ASC LIMIT 20`,
    [userId]
  );
  const paid = [];
  for (const row of pending.rows) {
    try {
      paid.push(await payReward(row.id));
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
};
