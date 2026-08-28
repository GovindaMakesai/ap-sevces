#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function main() {
  const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL || 'developer.govinda00@gmail.com').toLowerCase();

  const owner = await db.query(`SELECT id, email, display_id, first_name, last_name FROM users WHERE lower(email)=$1`, [
    ownerEmail,
  ]);
  console.log('OWNER', owner.rows[0] || null);

  const wallet = await db.query(
    `SELECT wt.id, wt.type, wt.amount, wt.currency_type, wt.reference_type, wt.reference_id, wt.status, wt.created_at, wt.metadata,
            u.email, u.display_id, u.first_name, u.last_name
     FROM wallet_transactions wt
     JOIN users u ON u.id = wt.user_id
     WHERE wt.created_at > NOW() - INTERVAL '48 hours'
       AND ABS(wt.amount::numeric) >= 50000
     ORDER BY wt.created_at DESC
     LIMIT 40`
  );
  console.log('\nWALLET_TX (>=50k, 48h):');
  console.log(JSON.stringify(wallet.rows, null, 2));

  const gifts = await db.query(
    `SELECT gt.id, gt.coin_amount, gt.gift_type, gt.created_at, gt.live_room_id,
            s.email AS sender_email, s.display_id AS sender_display_id,
            r.email AS receiver_email, r.display_id AS receiver_display_id, r.first_name, r.last_name
     FROM gift_transactions gt
     JOIN users s ON s.id = gt.sender_id
     JOIN users r ON r.id = gt.receiver_id
     WHERE gt.created_at > NOW() - INTERVAL '48 hours'
       AND gt.coin_amount::numeric >= 50000
     ORDER BY gt.created_at DESC
     LIMIT 40`
  );
  console.log('\nGIFT_TX (>=50k, 48h):');
  console.log(JSON.stringify(gifts.rows, null, 2));

  if (owner.rows[0]) {
    const oid = owner.rows[0].id;
    const sent = await db.query(
      `SELECT gt.id, gt.coin_amount, gt.created_at, r.email, r.display_id, r.first_name, r.last_name
       FROM gift_transactions gt
       JOIN users r ON r.id = gt.receiver_id
       WHERE gt.sender_id = $1
       ORDER BY gt.created_at DESC
       LIMIT 10`,
      [oid]
    );
    console.log('\nOWNER_RECENT_GIFTS:');
    console.log(JSON.stringify(sent.rows, null, 2));

    const transfers = await db.query(
      `SELECT cst.id, cst.coins, cst.transfer_type, cst.created_at, r.email, r.display_id, r.first_name, r.last_name
       FROM coin_seller_transfers cst
       JOIN users r ON r.id = cst.recipient_id
       WHERE cst.seller_id = $1
       ORDER BY cst.created_at DESC
       LIMIT 10`,
      [oid]
    ).catch(() => ({ rows: [] }));
    console.log('\nOWNER_RECENT_TRANSFERS:');
    console.log(JSON.stringify(transfers.rows, null, 2));
  }

  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
