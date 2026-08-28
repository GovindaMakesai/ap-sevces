#!/usr/bin/env node
/**
 * Reverse a mistaken gift and all wallet side-effects.
 * Usage:
 *   node backend/scripts/undo-gift.js <giftId>           # dry run
 *   node backend/scripts/undo-gift.js <giftId> --apply
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const walletService = require('../services/walletService');
const platformService = require('../services/platformService');
const leaderboardService = require('../services/leaderboardService');

const APPLY = process.argv.includes('--apply');
const giftId = process.argv.find((a) => a && !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);

async function main() {
  if (!giftId) {
    console.error('Usage: node backend/scripts/undo-gift.js <giftId> [--apply]');
    process.exit(1);
  }

  const giftRes = await db.query(`SELECT * FROM gift_transactions WHERE id = $1`, [giftId]);
  const gift = giftRes.rows[0];
  if (!gift) throw new Error(`Gift not found: ${giftId}`);

  const txRes = await db.query(
    `SELECT wt.*, u.email
     FROM wallet_transactions wt
     LEFT JOIN users u ON u.id = wt.user_id
     WHERE wt.reference_id::text = $1
        OR (wt.metadata->>'sender_id' = $2::text AND wt.created_at BETWEEN $3::timestamptz - INTERVAL '3 seconds' AND $3::timestamptz + INTERVAL '3 seconds')
        OR (wt.user_id = $2::uuid AND wt.type = 'gift_sent' AND wt.created_at BETWEEN $3::timestamptz - INTERVAL '3 seconds' AND $3::timestamptz + INTERVAL '3 seconds')
     ORDER BY wt.created_at`,
    [giftId, gift.sender_id, gift.created_at]
  );

  const allTx = [...txRes.rows];

  const commRes = await db.query(`SELECT * FROM commission_transactions WHERE gift_id = $1`, [giftId]);

  console.log('GIFT', gift);
  console.log('WALLET_TX', allTx);
  console.log('COMMISSION_TX', commRes.rows);

  const plan = [];
  for (const tx of allTx) {
    const amt = Number(tx.amount);
    if (!amt) continue;
    if (tx.type === 'gift_sent' && amt < 0) {
      const refund = Math.abs(amt);
      const fromGift = Number(tx.metadata?.from_gift_inventory || refund);
      const fromWallet = Number(tx.metadata?.from_wallet || 0);
      plan.push({
        action: 'refund_sender',
        userId: tx.user_id,
        giftInventory: fromGift,
        wallet: fromWallet,
        note: `Refund gift spend ${refund}`,
      });
    } else if (tx.currency_type === 'star' && amt > 0) {
      plan.push({
        action: 'debit_stars',
        userId: tx.user_id,
        amount: amt,
        note: `Claw back host points from ${tx.type}`,
      });
    } else if (tx.currency_type === 'coin' && amt > 0 && ['gift_received', 'agency_commission', 'invite_agency_commission', 'bd_commission', 'platform_fee'].includes(tx.type)) {
      plan.push({
        action: 'debit_coins',
        userId: tx.user_id,
        amount: amt,
        note: `Claw back ${tx.type}`,
      });
    }
  }

  console.log('\nPLAN', JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log('\nDry run only — pass --apply to execute');
    await db.pool.end();
    return;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (const step of plan) {
      if (step.action === 'refund_sender') {
        if (step.giftInventory > 0) {
          await client.query(
            `INSERT INTO coin_seller_profiles (user_id, display_name, gift_inventory_coins, inventory_coins, is_active)
             SELECT $1, TRIM(CONCAT(first_name,' ',last_name)), $2, 0, TRUE FROM users WHERE id = $1
             ON CONFLICT (user_id) DO UPDATE
               SET gift_inventory_coins = coin_seller_profiles.gift_inventory_coins + EXCLUDED.gift_inventory_coins,
                   updated_at = CURRENT_TIMESTAMP`,
            [step.userId, step.giftInventory]
          );
          await client.query(
            `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
             VALUES ($1, 'gift_reversal', $2, 'coin', 'gift', $3, 'completed', $4::jsonb)`,
            [
              step.userId,
              String(step.giftInventory),
              giftId,
              JSON.stringify({ reason: 'mistaken_gift_undo', direction: 'refund_gift_inventory' }),
            ]
          );
        }
        if (step.wallet > 0) {
          await walletService.creditCoins(
            step.userId,
            step.wallet,
            {
              type: 'gift_reversal',
              reference_type: 'gift',
              reference_id: giftId,
              metadata: { reason: 'mistaken_gift_undo', direction: 'refund_wallet' },
            },
            client
          );
        }
      } else if (step.action === 'debit_stars') {
        await walletService.debitStars(
          step.userId,
          step.amount,
          {
            type: 'gift_reversal',
            reference_type: 'gift',
            reference_id: giftId,
            metadata: { reason: 'mistaken_gift_undo', original: step.note },
          },
          client
        );
      } else if (step.action === 'debit_coins') {
        await walletService.debitCoins(
          step.userId,
          step.amount,
          {
            type: 'gift_reversal',
            reference_type: 'gift',
            reference_id: giftId,
            metadata: { reason: 'mistaken_gift_undo', original: step.note },
          },
          client
        );
      }
    }

    await client.query(
      `UPDATE gift_transactions
       SET gift_type = CASE
         WHEN gift_type LIKE '%_reversed' THEN gift_type
         ELSE gift_type || '_reversed'
       END
       WHERE id = $1`,
      [giftId]
    );

    await client.query('COMMIT');
    console.log('\nAPPLIED gift reversal for', giftId);

    try {
      const amount = Number(gift.coin_amount || 0);
      const periods = ['daily', 'weekly', 'monthly'];
      for (const p of periods) {
        await leaderboardService.upsertScore({
          periodType: p,
          category: 'gifters',
          entityId: gift.sender_id,
          delta: -amount,
        });
        await leaderboardService.upsertScore({
          periodType: p,
          category: 'creators',
          entityId: gift.receiver_id,
          delta: -Number(gift.creator_amount || amount),
        });
        await leaderboardService.upsertScore({
          periodType: p,
          category: 'earners',
          entityId: gift.receiver_id,
          delta: -Number(gift.creator_amount || amount),
        });
      }
    } catch (e) {
      console.warn('Leaderboard adjust warn:', e.message);
    }
  } catch (e) {
    await db.safeRollback(client);
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
