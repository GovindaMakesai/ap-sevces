#!/usr/bin/env node
/**
 * Stop invite mission/task automatic points for everyone.
 * 1) Backup referral_rewards + settings + recent wallet referral txs
 * 2) Set invite_rewards_enabled = false
 * 3) Reject all pending/scheduled/approved rewards (cannot Receive)
 *
 * Usage:
 *   node backend/scripts/disable-invite-mission-points.js           # dry run
 *   node backend/scripts/disable-invite-mission-points.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const settings = require('../modules/referral/services/settingsService');

const APPLY = process.argv.includes('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(__dirname, `../backups/invite-rewards-${stamp}`);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const enabledBefore = await settings.getSetting('invite_rewards_enabled', false);
  const allSettings = (
    await db.query(`SELECT key, value, updated_at, updated_by FROM referral_settings ORDER BY key`)
  ).rows;

  const statusCounts = (
    await db.query(
      `SELECT status, reward_type, COUNT(*)::int AS n,
              COALESCE(SUM(coins),0)::bigint AS coins_sum
       FROM referral_rewards
       GROUP BY 1, 2
       ORDER BY 1, 2`
    )
  ).rows;

  const claimable = (
    await db.query(
      `SELECT id, referral_id, beneficiary_id, beneficiary_role, reward_type, coins, stars,
              status, metadata, created_at, paid_at
       FROM referral_rewards
       WHERE status IN ('pending', 'scheduled', 'approved')
       ORDER BY created_at`
    )
  ).rows;

  const allRewards = (
    await db.query(
      `SELECT id, referral_id, beneficiary_id, beneficiary_role, reward_type, coins, stars,
              status, approval_mode, scheduled_for, paid_at, wallet_tx_id, metadata,
              created_at, updated_at
       FROM referral_rewards
       ORDER BY created_at`
    )
  ).rows;

  const walletTx = (
    await db.query(
      `SELECT id, user_id, type, amount, currency_type, reference_type, reference_id,
              status, metadata, created_at
       FROM wallet_transactions
       WHERE type = 'referral_reward' OR reference_type = 'referral_reward'
       ORDER BY created_at`
    )
  ).rows;

  const backup = {
    created_at: new Date().toISOString(),
    reason: 'Disable invite mission/task automatic points (invite UI hidden)',
    invite_rewards_enabled_before: enabledBefore,
    status_counts: statusCounts,
    claimable_count: claimable.length,
    claimable_points_sum: claimable.reduce((s, r) => s + Number(r.coins || r.stars || 0), 0),
  };

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(backup, null, 2));
  fs.writeFileSync(path.join(outDir, 'referral_settings.json'), JSON.stringify(allSettings, null, 2));
  fs.writeFileSync(path.join(outDir, 'referral_rewards_all.json'), JSON.stringify(allRewards, null, 2));
  fs.writeFileSync(path.join(outDir, 'referral_rewards_claimable.json'), JSON.stringify(claimable, null, 2));
  fs.writeFileSync(path.join(outDir, 'wallet_referral_transactions.json'), JSON.stringify(walletTx, null, 2));

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        backup_dir: outDir,
        invite_rewards_enabled_before: enabledBefore,
        claimable_count: claimable.length,
        claimable_points_sum: backup.claimable_points_sum,
        status_counts: statusCounts,
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to disable + reject claimable rewards.');
    await db.pool.end();
    return;
  }

  await settings.setSetting('invite_rewards_enabled', false, null);
  await settings.setSetting(
    'invite_mission_points_disabled_at',
    new Date().toISOString(),
    null
  );
  await settings.setSetting(
    'invite_mission_points_disabled_reason',
    'Invite feature hidden — stop automatic mission/task points for all',
    null
  );

  const rejected = await db.query(
    `UPDATE referral_rewards
     SET status = 'rejected',
         updated_at = CURRENT_TIMESTAMP,
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
     WHERE status IN ('pending', 'scheduled', 'approved')
     RETURNING id, beneficiary_id, reward_type, coins`,
    [
      JSON.stringify({
        rejected_reason: 'invite_feature_hidden_stop_mission_points',
        rejected_at: new Date().toISOString(),
        backup_dir: path.basename(outDir),
      }),
    ]
  );

  const enabledAfter = await settings.getSetting('invite_rewards_enabled', false);

  const result = {
    success: true,
    invite_rewards_enabled_after: enabledAfter,
    rejected_count: rejected.rows.length,
    rejected_points_sum: rejected.rows.reduce((s, r) => s + Number(r.coins || 0), 0),
    backup_dir: outDir,
  };
  fs.writeFileSync(path.join(outDir, 'apply_result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
