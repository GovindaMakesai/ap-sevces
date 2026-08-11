#!/usr/bin/env node
/**
 * Claw back ALL invite / referral POINTS (stars) already paid to wallets.
 * Also:
 *  - reject unclaimed referral_rewards (pending/scheduled/approved)
 *  - force-disable invite_rewards_enabled
 *  - reject pending withdrawals for affected users so held points can be reclaimed
 *    (refund → then debit invite total)
 *
 * Coins from old referral credits are left alone (modern path = stars only).
 *
 * Usage:
 *   node backend/scripts/clawback-invite-points-all.js           # dry run
 *   node backend/scripts/clawback-invite-points-all.js --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const settings = require('../modules/referral/services/settingsService');
const walletService = require('../services/walletService');

const APPLY = process.argv.includes('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(__dirname, `../backups/invite-points-clawback-${stamp}`);

function n(v) {
  return Number(v || 0);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const enabledBefore = await settings.getSetting('invite_rewards_enabled', false);

  /* Lifetime positive referral credits on points (stars) */
  const credits = (
    await db.query(
      `SELECT user_id,
              COALESCE(SUM(amount::numeric), 0)::bigint AS credited
       FROM wallet_transactions
       WHERE currency_type = 'star'
         AND amount::numeric > 0
         AND (
           type = 'referral_reward'
           OR reference_type = 'referral_reward'
           OR (metadata->>'source') = 'modules/referral'
         )
       GROUP BY user_id`
    )
  ).rows;

  /* Prior clawbacks so re-run is safe */
  const priorClaw = (
    await db.query(
      `SELECT user_id,
              COALESCE(SUM(ABS(amount::numeric)), 0)::bigint AS clawed
       FROM wallet_transactions
       WHERE currency_type = 'star'
         AND amount::numeric < 0
         AND (
           reference_type = 'invite_points_clawback'
           OR type = 'invite_points_clawback'
           OR (metadata->>'reason') = 'invite_feature_removed_clawback'
         )
       GROUP BY user_id`
    )
  ).rows;
  const clawedMap = new Map(priorClaw.map((r) => [String(r.user_id), n(r.clawed)]));

  const balances = (
    await db.query(
      `SELECT user_id, COALESCE(star_balance, 0)::bigint AS points
       FROM wallets
       WHERE user_id = ANY($1::uuid[])`,
      [credits.map((c) => c.user_id)]
    )
  ).rows;
  const balMap = new Map(balances.map((r) => [String(r.user_id), n(r.points)]));

  const pendingWds = (
    await db.query(
      `SELECT id, user_id, amount, amount_inr, status, created_at
       FROM withdrawals
       WHERE status = 'pending'
         AND user_id = ANY($1::uuid[])
       ORDER BY created_at`,
      [credits.map((c) => c.user_id)]
    )
  ).rows;
  const pendingByUser = new Map();
  for (const w of pendingWds) {
    const k = String(w.user_id);
    if (!pendingByUser.has(k)) pendingByUser.set(k, []);
    pendingByUser.get(k).push(w);
  }

  const users = (
    await db.query(
      `SELECT id, display_id, email, first_name, last_name, role
       FROM users WHERE id = ANY($1::uuid[])`,
      [credits.map((c) => c.user_id)]
    )
  ).rows;
  const userMap = new Map(users.map((u) => [String(u.id), u]));

  const plan = [];
  let totalTarget = 0;
  let totalCanClawNow = 0;
  let totalPendingWd = 0;

  for (const row of credits) {
    const uid = String(row.user_id);
    const credited = n(row.credited);
    const already = clawedMap.get(uid) || 0;
    const target = Math.max(0, credited - already);
    if (target <= 0) continue;

    const freePoints = balMap.get(uid) || 0;
    const pendingList = pendingByUser.get(uid) || [];
    const pendingSum = pendingList.reduce((s, w) => s + n(w.amount), 0);
    /* After reject+refund, balance becomes free + pending held */
    const pointsAfterRefunds = freePoints + pendingSum;
    const clawAmount = Math.min(pointsAfterRefunds, target);
    const shortfall = Math.max(0, target - clawAmount);

    const u = userMap.get(uid) || {};
    plan.push({
      user_id: uid,
      display_id: u.display_id,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      email: u.email,
      role: u.role,
      referral_points_credited: credited,
      already_clawed: already,
      target_clawback: target,
      free_points_now: freePoints,
      pending_withdrawals: pendingList.map((w) => ({
        id: w.id,
        amount: n(w.amount),
        amount_inr: w.amount_inr,
      })),
      pending_points_held: pendingSum,
      will_claw: clawAmount,
      shortfall_if_spent: shortfall,
    });
    totalTarget += target;
    totalCanClawNow += clawAmount;
    totalPendingWd += pendingSum;
  }

  plan.sort((a, b) => b.will_claw - a.will_claw);

  const unpaidRewards = (
    await db.query(
      `SELECT status, reward_type, COUNT(*)::int AS n,
              COALESCE(SUM(coins),0)::bigint AS coins_sum
       FROM referral_rewards
       WHERE status IN ('pending', 'scheduled', 'approved')
       GROUP BY 1, 2
       ORDER BY 1, 2`
    )
  ).rows;

  const summary = {
    created_at: new Date().toISOString(),
    apply: APPLY,
    invite_rewards_enabled_before: enabledBefore,
    users_with_invite_points: plan.length,
    total_target_clawback_points: totalTarget,
    total_will_claw_points: totalCanClawNow,
    total_pending_withdrawal_points_to_reject_first: totalPendingWd,
    unpaid_reward_rows: unpaidRewards,
    top_users: plan.slice(0, 30),
  };

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'plan_all_users.json'), JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to claw back invite points for all users.');
    await db.pool.end();
    return;
  }

  /* 1) Disable further invites */
  await settings.setSetting('invite_rewards_enabled', false, null);
  await settings.setSetting('invite_mission_points_disabled_at', new Date().toISOString(), null);
  await settings.setSetting(
    'invite_mission_points_disabled_reason',
    'Invite points removed for all users — clawback invite_points_clawback',
    null
  );

  /* 2) Reject claimable rewards */
  const rejectedRewards = await db.query(
    `UPDATE referral_rewards
     SET status = 'rejected',
         updated_at = CURRENT_TIMESTAMP,
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
     WHERE status IN ('pending', 'scheduled', 'approved')
     RETURNING id, beneficiary_id, reward_type, coins`,
    [
      JSON.stringify({
        rejected_reason: 'invite_points_removed_for_all',
        rejected_at: new Date().toISOString(),
      }),
    ]
  );

  /* 3) Mark paid rewards as clawed (status keep paid, flag metadata) */
  await db.query(
    `UPDATE referral_rewards
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'paid'`,
    [
      JSON.stringify({
        wallet_clawback: 'invite_points_clawback',
        clawback_at: new Date().toISOString(),
      }),
    ]
  );

  const results = [];
  const transactionService = require('../services/transactionService');

  for (const p of plan) {
    if (p.will_claw <= 0 && !(p.pending_withdrawals || []).length) {
      results.push({ ...p, status: 'skip_zero' });
      continue;
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      /* Reject pending withdraws → refund into wallet inside same session where possible.
         transactionService uses its own connection; call after our claw or use inline. */
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    /* Reject pending withdrawals (uses own TX + refund) */
    const rejectedWd = [];
    for (const wd of p.pending_withdrawals || []) {
      try {
        await transactionService.rejectWithdrawal(
          wd.id,
          null,
          'Auto-reject: invite mission/referral points being removed platform-wide'
        );
        rejectedWd.push({ id: wd.id, amount: wd.amount, ok: true });
      } catch (e) {
        rejectedWd.push({ id: wd.id, amount: wd.amount, ok: false, error: e.message });
      }
    }

    /* Debit invite points (min balance, target) */
    let clawed = 0;
    let balAfter = null;
    let txId = null;
    try {
      const c = await db.pool.connect();
      try {
        await c.query('BEGIN');
        const wallet = await walletService.getOrCreateWallet(p.user_id, c);
        const current = BigInt(wallet.star_balance || 0);
        const want = BigInt(p.target_clawback);
        const take = current < want ? current : want;
        if (take > 0n) {
          const newBal = current - take;
          await c.query(
            `UPDATE wallets SET star_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [newBal.toString(), wallet.id]
          );
          const tx = await c.query(
            `INSERT INTO wallet_transactions
               (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
             VALUES ($1, 'invite_points_clawback', $2, 'star', 'invite_points_clawback', NULL, 'completed', $3)
             RETURNING id`,
            [
              p.user_id,
              (-Number(take)).toString(),
              JSON.stringify({
                reason: 'invite_feature_removed_clawback',
                referral_points_credited: p.referral_points_credited,
                already_clawed_before: p.already_clawed,
                target: p.target_clawback,
                clawed: Number(take),
                display_id: p.display_id,
              }),
            ]
          );
          clawed = Number(take);
          balAfter = Number(newBal);
          txId = tx.rows[0].id;
        } else {
          balAfter = Number(current);
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
      results.push({
        user_id: p.user_id,
        display_id: p.display_id,
        target: p.target_clawback,
        clawed,
        star_balance_after: balAfter,
        tx_id: txId,
        withdrawals_rejected: rejectedWd,
        status: 'ok',
      });
    } catch (e) {
      results.push({
        user_id: p.user_id,
        display_id: p.display_id,
        target: p.target_clawback,
        clawed: 0,
        status: 'error',
        error: e.message,
        withdrawals_rejected: rejectedWd,
      });
    }
  }

  const applyResult = {
    success: true,
    invite_rewards_enabled_after: await settings.getSetting('invite_rewards_enabled', false),
    unpaid_rewards_rejected: rejectedRewards.rows.length,
    users_processed: results.length,
    total_points_clawed: results.reduce((s, r) => s + n(r.clawed), 0),
    errors: results.filter((r) => r.status === 'error'),
    backup_dir: outDir,
  };
  fs.writeFileSync(path.join(outDir, 'apply_result.json'), JSON.stringify(applyResult, null, 2));
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(applyResult, null, 2));

  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_) {}
  process.exit(1);
});
