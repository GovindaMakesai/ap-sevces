#!/usr/bin/env node
/**
 * Set points (star_balance) to 0 for display_ids.
 * Rejects pending withdrawals first so held points return and can be zeroed.
 *
 * Usage:
 *   node backend/scripts/zero-points-by-display-id.js 2002819 4367167 ...
 *   node backend/scripts/zero-points-by-display-id.js --apply 2002819 ...
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const walletService = require('../services/walletService');
const transactionService = require('../services/transactionService');

const args = process.argv.slice(2).filter(Boolean);
const APPLY = args.includes('--apply');
const IDS = args.filter((a) => a !== '--apply' && /^\d+$/.test(a));

if (!IDS.length) {
  console.error('Usage: node backend/scripts/zero-points-by-display-id.js [--apply] <display_id>...');
  process.exit(1);
}

async function main() {
  const users = (
    await db.query(
      `SELECT u.id, u.display_id, u.email, u.first_name, u.last_name, u.role,
              COALESCE(w.coin_balance, 0)::bigint AS coins,
              COALESCE(w.star_balance, 0)::bigint AS points
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE CAST(u.display_id AS TEXT) = ANY($1::text[])
       ORDER BY u.display_id`,
      [IDS]
    )
  ).rows;

  const found = new Set(users.map((u) => String(u.display_id)));
  const missing = IDS.filter((id) => !found.has(String(id)));

  const plan = [];
  for (const u of users) {
    const pending = (
      await db.query(
        `SELECT id, amount, amount_inr, status, created_at
         FROM withdrawals WHERE user_id = $1 AND status = 'pending'`,
        [u.id]
      )
    ).rows;
    plan.push({
      display_id: u.display_id,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      email: u.email,
      role: u.role,
      coins: Number(u.coins),
      points_now: Number(u.points),
      pending_withdrawals: pending.map((w) => ({
        id: w.id,
        amount: Number(w.amount),
        amount_inr: w.amount_inr,
      })),
    });
  }

  console.log(JSON.stringify({ apply: APPLY, missing, plan }, null, 2));
  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to zero points.');
    await db.pool.end();
    return;
  }

  const results = [];
  for (const p of plan) {
    const userId = users.find((u) => String(u.display_id) === String(p.display_id)).id;
    const wdOut = [];
    for (const wd of p.pending_withdrawals) {
      try {
        await transactionService.rejectWithdrawal(
          wd.id,
          null,
          'Admin zero points — auto-reject pending withdrawal'
        );
        wdOut.push({ id: wd.id, amount: wd.amount, ok: true });
      } catch (e) {
        wdOut.push({ id: wd.id, amount: wd.amount, ok: false, error: e.message });
      }
    }

    const before = await walletService.getBalance(userId);
    const current = Number(before.star_balance || 0);
    let after = current;
    try {
      if (current > 0) {
        const res = await walletService.debitStars(userId, current, {
          type: 'admin_adjustment',
          reference_type: 'admin_zero_points',
          metadata: {
            reason: 'Admin set points to 0 (fraud / invalid balance cleanup)',
            display_id: p.display_id,
            before: current,
            target: 0,
          },
        });
        after = res.star_balance;
      }
      results.push({
        display_id: p.display_id,
        email: p.email,
        points_before: current,
        points_after: after,
        coins: Number(before.coin_balance || 0),
        withdrawals_rejected: wdOut,
        status: 'ok',
      });
    } catch (e) {
      results.push({
        display_id: p.display_id,
        points_before: current,
        status: 'error',
        error: e.message,
        withdrawals_rejected: wdOut,
      });
    }
  }

  console.log(JSON.stringify({ success: true, results }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_) {}
  process.exit(1);
});
