#!/usr/bin/env node
/**
 * Full wallet trail by display_id — how coins/points accumulated.
 * Usage: node backend/scripts/audit-wallet-trail.js <display_id>
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const DISPLAY_ID = String(process.argv[2] || '').trim();
if (!DISPLAY_ID) {
  console.error('Usage: node backend/scripts/audit-wallet-trail.js <display_id>');
  process.exit(1);
}

function n(v) {
  return Number(v || 0);
}

async function tableExists(name) {
  const r = await db.query(`SELECT to_regclass($1) AS t`, [`public.${name}`]);
  return Boolean(r.rows[0]?.t);
}

async function main() {
  const userRes = await db.query(
    `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.role, u.display_id,
            u.created_at, u.is_active, u.is_verified, u.last_login,
            COALESCE(w.coin_balance, 0) AS coins,
            COALESCE(w.star_balance, 0) AS points,
            w.updated_at AS wallet_updated_at
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE CAST(u.display_id AS TEXT) = $1
     LIMIT 1`,
    [DISPLAY_ID]
  );
  const u = userRes.rows[0];
  if (!u) {
    console.log(JSON.stringify({ error: 'not found', display_id: DISPLAY_ID }, null, 2));
    await db.pool.end();
    process.exit(2);
  }

  const uid = u.id;

  const [txSummary, bigTx, creditsOnly, recent, recharges, withdrawals, giftsSent, giftsRecv] =
    await Promise.all([
      db.query(
        `SELECT currency_type, type, reference_type, status,
                COUNT(*)::int AS n,
                COALESCE(SUM(amount::numeric), 0)::text AS total_amount,
                MIN(created_at) AS first_at,
                MAX(created_at) AS last_at
         FROM wallet_transactions
         WHERE user_id = $1
         GROUP BY currency_type, type, reference_type, status
         ORDER BY currency_type, ABS(SUM(amount::numeric)) DESC`,
        [uid]
      ),
      db.query(
        `SELECT id, type, amount, currency_type, reference_type, reference_id, status,
                metadata, created_at
         FROM wallet_transactions
         WHERE user_id = $1
         ORDER BY ABS(amount::numeric) DESC NULLS LAST
         LIMIT 50`,
        [uid]
      ),
      db.query(
        `SELECT id, type, amount, currency_type, reference_type, reference_id, status,
                metadata, created_at
         FROM wallet_transactions
         WHERE user_id = $1
           AND amount::numeric > 0
         ORDER BY amount::numeric DESC
         LIMIT 80`,
        [uid]
      ),
      db.query(
        `SELECT id, type, amount, currency_type, reference_type, reference_id, status,
                metadata, created_at
         FROM wallet_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 40`,
        [uid]
      ),
      db.query(
        `SELECT id, amount_inr, coins_credited, payment_status, transaction_id,
                payment_method, created_at, updated_at
         FROM recharges
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [uid]
      ).catch(() => ({ rows: [] })),
      db.query(
        `SELECT id, amount, status, method, order_number, amount_inr, created_at
         FROM withdrawals
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [uid]
      ).catch(() => ({ rows: [] })),
      db.query(
        `SELECT COUNT(*)::int AS gift_count,
                COALESCE(SUM(coin_amount), 0)::bigint AS coins_spent
         FROM gift_transactions WHERE sender_id = $1`,
        [uid]
      ).catch(() => ({ rows: [{ gift_count: 0, coins_spent: 0 }] })),
      db.query(
        `SELECT COUNT(*)::int AS gift_count,
                COALESCE(SUM(coin_amount), 0)::bigint AS coins_value,
                COALESCE(SUM(creator_amount), 0)::bigint AS points_earned
         FROM gift_transactions WHERE receiver_id = $1`,
        [uid]
      ).catch(() => ({ rows: [{ gift_count: 0, coins_value: 0, points_earned: 0 }] })),
    ]);

  // Credit totals by source
  const creditBySource = await db.query(
    `SELECT currency_type,
            COALESCE(reference_type, type, 'unknown') AS source,
            COUNT(*)::int AS n,
            COALESCE(SUM(amount::numeric), 0)::text AS total_in
     FROM wallet_transactions
     WHERE user_id = $1 AND amount::numeric > 0
     GROUP BY currency_type, COALESCE(reference_type, type, 'unknown')
     ORDER BY currency_type, SUM(amount::numeric) DESC`,
    [uid]
  );

  const debitBySource = await db.query(
    `SELECT currency_type,
            COALESCE(reference_type, type, 'unknown') AS source,
            COUNT(*)::int AS n,
            COALESCE(SUM(amount::numeric), 0)::text AS total_out
     FROM wallet_transactions
     WHERE user_id = $1 AND amount::numeric < 0
     GROUP BY currency_type, COALESCE(reference_type, type, 'unknown')
     ORDER BY currency_type, SUM(amount::numeric) ASC`,
    [uid]
  );

  const netLedger = await db.query(
    `SELECT currency_type,
            COALESCE(SUM(amount::numeric) FILTER (WHERE amount::numeric > 0), 0)::text AS total_credits,
            COALESCE(SUM(amount::numeric) FILTER (WHERE amount::numeric < 0), 0)::text AS total_debits,
            COALESCE(SUM(amount::numeric), 0)::text AS net_from_tx,
            COUNT(*)::int AS tx_count
     FROM wallet_transactions
     WHERE user_id = $1
     GROUP BY currency_type`,
    [uid]
  );

  // Coin seller inventory / transfers if tables exist
  let coinSellerOrders = { rows: [] };
  let peerTransfers = { rows: [] };
  if (await tableExists('coin_seller_orders')) {
    coinSellerOrders = await db.query(
      `SELECT * FROM coin_seller_orders
       WHERE buyer_id = $1 OR seller_id = $1
       ORDER BY created_at DESC NULLS LAST
       LIMIT 30`,
      [uid]
    ).catch(() => ({ rows: [] }));
  }
  if (await tableExists('coin_transfers')) {
    peerTransfers = await db.query(
      `SELECT * FROM coin_transfers
       WHERE from_user_id = $1 OR to_user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [uid]
    ).catch(() => ({ rows: [] }));
  }

  // Admin audit logs mentioning this user
  let adminAudit = { rows: [] };
  if (await tableExists('admin_audit_logs')) {
    adminAudit = await db.query(
      `SELECT action, entity_type, entity_id, metadata, created_at, admin_user_id
       FROM admin_audit_logs
       WHERE entity_id::text = $1
          OR metadata::text ILIKE '%' || $1 || '%'
          OR metadata::text ILIKE '%' || $2 || '%'
       ORDER BY created_at DESC
       LIMIT 40`,
      [uid, DISPLAY_ID]
    ).catch(() => ({ rows: [] }));
  }
  if (!adminAudit.rows.length && (await tableExists('audit_logs'))) {
    adminAudit = await db.query(
      `SELECT * FROM audit_logs
       WHERE user_id = $1 OR target_user_id = $1
       ORDER BY created_at DESC
       LIMIT 40`,
      [uid]
    ).catch(() => ({ rows: [] }));
  }

  // Daily inflow coins for chart-like view
  const dailyCredits = await db.query(
    `SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
            currency_type,
            COALESCE(reference_type, type) AS source,
            COUNT(*)::int AS n,
            SUM(amount::numeric)::text AS total
     FROM wallet_transactions
     WHERE user_id = $1 AND amount::numeric > 0
     GROUP BY 1, 2, 3
     ORDER BY day_ist DESC, ABS(SUM(amount::numeric)) DESC
     LIMIT 60`,
    [uid]
  );

  // Largest single credits with full metadata
  const topCredits = creditsOnly.rows.map((r) => ({
    ...r,
    amount: n(r.amount),
    metadata:
      typeof r.metadata === 'string'
        ? (() => {
            try {
              return JSON.parse(r.metadata);
            } catch {
              return r.metadata;
            }
          })()
        : r.metadata,
  }));

  const out = {
    display_id: u.display_id,
    name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
    email: u.email,
    phone: u.phone,
    role: u.role,
    is_active: u.is_active,
    created_at: u.created_at,
    last_login: u.last_login,
    current_wallet: {
      coins: n(u.coins),
      points: n(u.points),
      wallet_updated_at: u.wallet_updated_at,
    },
    ledger_net: netLedger.rows,
    credits_by_source: creditBySource.rows,
    debits_by_source: debitBySource.rows,
    gifts: {
      sent: giftsSent.rows[0],
      received: giftsRecv.rows[0],
    },
    recharges: recharges.rows,
    withdrawals: withdrawals.rows,
    coin_seller_orders: coinSellerOrders.rows,
    peer_transfers: peerTransfers.rows,
    admin_audit: adminAudit.rows,
    daily_credits_ist: dailyCredits.rows,
    top_credits: topCredits,
    biggest_transactions: bigTx.rows.map((r) => ({
      ...r,
      amount: n(r.amount),
    })),
    recent_transactions: recent.rows.map((r) => ({
      ...r,
      amount: n(r.amount),
    })),
    tx_summary: txSummary.rows,
  };

  console.log(JSON.stringify(out, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_) {}
  process.exit(1);
});
