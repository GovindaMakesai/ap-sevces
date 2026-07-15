#!/usr/bin/env node
/**
 * Backup all wallet coin + star (points) balances, then set them to 0.
 *
 * Usage:
 *   node backend/scripts/backup-and-zero-wallets.js
 *   node backend/scripts/backup-and-zero-wallets.js --dry-run
 *   node backend/scripts/backup-and-zero-wallets.js --label "pre-launch-reset"
 *
 * Restore example (manual):
 *   UPDATE wallets w SET
 *     coin_balance = b.coin_balance,
 *     star_balance = b.star_balance,
 *     updated_at = CURRENT_TIMESTAMP
 *   FROM wallet_balance_backups b
 *   WHERE w.user_id = b.user_id AND b.snapshot_id = '<snapshot-uuid>';
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const dryRun = process.argv.includes('--dry-run');
const labelArg = process.argv.find((a) => a.startsWith('--label='));
const label =
  (labelArg && labelArg.split('=').slice(1).join('=')) ||
  (process.argv.includes('--label')
    ? process.argv[process.argv.indexOf('--label') + 1]
    : null) ||
  `zero-wallets-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

async function ensureBackupTable(client) {
  const sqlPath = path.join(__dirname, '../../database/migrations/015_wallet_balance_backups.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await client.query(sql);
}

async function main() {
  const client = await db.pool.connect();
  const snapshotId = crypto.randomUUID();

  try {
    await client.query('BEGIN');
    await ensureBackupTable(client);

    const before = await client.query(
      `SELECT
         COUNT(*)::int AS wallet_rows,
         COALESCE(SUM(coin_balance), 0)::bigint AS total_coins,
         COALESCE(SUM(star_balance), 0)::bigint AS total_stars,
         COUNT(*) FILTER (WHERE coin_balance > 0 OR star_balance > 0)::int AS non_zero_wallets
       FROM wallets`
    );
    const summaryBefore = before.rows[0];

    const insert = await client.query(
      `INSERT INTO wallet_balance_backups (
         snapshot_id, snapshot_label, user_id, coin_balance, star_balance, seller_inventory_coins
       )
       SELECT
         $1::uuid,
         $2,
         w.user_id,
         w.coin_balance,
         w.star_balance,
         COALESCE(p.inventory_coins, 0)
       FROM wallets w
       LEFT JOIN coin_seller_profiles p ON p.user_id = w.user_id
       RETURNING user_id`,
      [snapshotId, label]
    );

    let zeroed = { rowCount: 0 };
    let ledger = { rowCount: 0 };

    if (!dryRun) {
      zeroed = await client.query(
        `UPDATE wallets
         SET coin_balance = 0,
             star_balance = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE coin_balance <> 0 OR star_balance <> 0`
      );

      // Audit trail in wallet_transactions (one row per currency per user that had balance)
      ledger = await client.query(
        `INSERT INTO wallet_transactions (
           user_id, type, amount, currency_type, reference_type, reference_id, status, metadata
         )
         SELECT
           b.user_id,
           'admin_adjustment',
           -b.coin_balance,
           'coin',
           'wallet_balance_backup',
           b.snapshot_id,
           'completed',
           jsonb_build_object(
             'reason', 'mass_zero_wallets',
             'snapshot_id', b.snapshot_id,
             'snapshot_label', b.snapshot_label,
             'coin_before', b.coin_balance,
             'star_before', b.star_balance
           )
         FROM wallet_balance_backups b
         WHERE b.snapshot_id = $1 AND b.coin_balance > 0
         UNION ALL
         SELECT
           b.user_id,
           'admin_adjustment',
           -b.star_balance,
           'star',
           'wallet_balance_backup',
           b.snapshot_id,
           'completed',
           jsonb_build_object(
             'reason', 'mass_zero_wallets',
             'snapshot_id', b.snapshot_id,
             'snapshot_label', b.snapshot_label,
             'coin_before', b.coin_balance,
             'star_before', b.star_balance
           )
         FROM wallet_balance_backups b
         WHERE b.snapshot_id = $1 AND b.star_balance > 0`,
        [snapshotId]
      );
    }

    const after = await client.query(
      `SELECT
         COALESCE(SUM(coin_balance), 0)::bigint AS total_coins,
         COALESCE(SUM(star_balance), 0)::bigint AS total_stars,
         COUNT(*) FILTER (WHERE coin_balance > 0 OR star_balance > 0)::int AS non_zero_wallets
       FROM wallets`
    );

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          dry_run: dryRun,
          snapshot_id: snapshotId,
          snapshot_label: label,
          backed_up_rows: insert.rowCount,
          before: {
            wallet_rows: summaryBefore.wallet_rows,
            total_coins: String(summaryBefore.total_coins),
            total_stars_points: String(summaryBefore.total_stars),
            non_zero_wallets: summaryBefore.non_zero_wallets,
          },
          after: dryRun
            ? { note: 'DRY RUN — no balances changed; backup insert rolled back' }
            : {
                wallets_zeroed: zeroed.rowCount,
                ledger_rows: ledger.rowCount,
                total_coins: String(after.rows[0].total_coins),
                total_stars_points: String(after.rows[0].total_stars),
                non_zero_wallets: after.rows[0].non_zero_wallets,
              },
          restore_hint:
            'UPDATE wallets w SET coin_balance = b.coin_balance, star_balance = b.star_balance, updated_at = CURRENT_TIMESTAMP FROM wallet_balance_backups b WHERE w.user_id = b.user_id AND b.snapshot_id = \'' +
            snapshotId +
            '\';',
        },
        null,
        2
      )
    );
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_e) {}
    throw e;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
