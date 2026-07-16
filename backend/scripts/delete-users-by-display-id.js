#!/usr/bin/env node
/**
 * Permanently delete users by public display_id.
 * Usage: node backend/scripts/delete-users-by-display-id.js <display_id> [display_id2 ...]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const IDS = process.argv.slice(2).map((s) => String(s || '').trim()).filter(Boolean);

async function trySql(client, sql, params = []) {
  const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await client.query(`SAVEPOINT ${sp}`);
    const r = await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { ok: true, count: r.rowCount || 0, rows: r.rows };
  } catch (err) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (_e) {
      /* ignore */
    }
    return { ok: false, error: err.message, code: err.code };
  }
}

async function deleteOne(client, user) {
  const uid = user.id;
  const report = {
    display_id: user.display_id,
    email: user.email,
    name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    id: uid,
    steps: {},
  };

  const steps = [
    ['null_banned_by', `UPDATE live_room_bans SET banned_by = NULL WHERE banned_by = $1`, [uid]],
    ['null_reviewed_by', `UPDATE role_applications SET reviewed_by = NULL WHERE reviewed_by = $1`, [uid]],
    ['end_live_rooms', `UPDATE live_rooms SET status = 'ended', ended_at = NOW() WHERE host_user_id = $1 AND COALESCE(status,'live') <> 'ended'`, [uid]],
    ['live_room_members', `DELETE FROM live_room_members WHERE user_id = $1`, [uid]],
    ['live_room_bans', `DELETE FROM live_room_bans WHERE user_id = $1`, [uid]],
    ['live_seat_requests', `DELETE FROM live_seat_requests WHERE user_id = $1`, [uid]],
    ['gift_sent', `DELETE FROM gift_transactions WHERE sender_id = $1`, [uid]],
    ['gift_recv', `DELETE FROM gift_transactions WHERE receiver_id = $1`, [uid]],
    ['wallet_tx', `DELETE FROM wallet_transactions WHERE user_id = $1`, [uid]],
    ['recharges', `DELETE FROM recharges WHERE user_id = $1`, [uid]],
    ['withdrawals', `DELETE FROM withdrawals WHERE user_id = $1`, [uid]],
    ['wallets', `DELETE FROM wallets WHERE user_id = $1`, [uid]],
    ['follows', `DELETE FROM user_follows WHERE follower_id = $1 OR following_id = $1`, [uid]],
    ['blocks', `DELETE FROM user_blocks WHERE blocker_id = $1 OR blocked_id = $1`, [uid]],
    ['notifications', `DELETE FROM notifications WHERE user_id = $1`, [uid]],
    ['user_roles', `DELETE FROM user_roles WHERE user_id = $1`, [uid]],
    ['chat_messages', `DELETE FROM chat_messages WHERE sender_id = $1 OR receiver_id = $1`, [uid]],
    ['conversations', `DELETE FROM conversations WHERE user_low = $1 OR user_high = $1`, [uid]],
    ['role_applications', `DELETE FROM role_applications WHERE user_id = $1`, [uid]],
    ['seller_orders', `DELETE FROM coin_seller_orders WHERE seller_id = $1 OR buyer_id = $1`, [uid]],
    ['seller_inventory', `DELETE FROM coin_seller_inventory WHERE user_id = $1`, [uid]],
    ['live_rooms_hosted', `DELETE FROM live_rooms WHERE host_user_id = $1`, [uid]],
    ['workers', `DELETE FROM workers WHERE user_id = $1`, [uid]],
    ['bookings', `DELETE FROM bookings WHERE customer_id = $1`, [uid]],
    ['devices', `DELETE FROM user_devices WHERE user_id = $1`, [uid]],
    ['refresh_tokens', `DELETE FROM refresh_tokens WHERE user_id = $1`, [uid]],
    ['otp_codes', `DELETE FROM otp_codes WHERE user_id = $1`, [uid]],
    ['agency_members_user', `DELETE FROM agency_members WHERE user_id = $1`, [uid]],
  ];

  for (const [label, sql, params] of steps) {
    const res = await trySql(client, sql, params);
    report.steps[label] = res.ok ? res.count : `skip:${res.code || res.error}`;
  }

  /* Agency ownership is often RESTRICT */
  const agencies = await trySql(client, `SELECT id FROM agencies WHERE owner_user_id = $1`, [uid]);
  if (agencies.ok && agencies.rows?.length) {
    for (const a of agencies.rows) {
      await trySql(client, `DELETE FROM agency_members WHERE agency_id = $1`, [a.id]);
      await trySql(client, `DELETE FROM agencies WHERE id = $1`, [a.id]);
    }
    report.steps.agencies_deleted = agencies.rows.length;
  }

  /* Catch-all: wipe any remaining FKs that reference users(id) by probing pg_catalog if needed */
  const del = await trySql(
    client,
    `DELETE FROM users WHERE id = $1 RETURNING id, email, display_id`,
    [uid]
  );
  if (!del.ok) {
    report.deleted = false;
    report.error = del.error;
    /* Discover blocking FKs */
    const fks = await trySql(
      client,
      `SELECT conrelid::regclass AS tbl, a.attname AS col
       FROM pg_constraint c
       JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
       WHERE c.confrelid = 'users'::regclass AND c.contype = 'f'
       ORDER BY 1`,
      []
    );
    report.fk_targets = fks.ok ? fks.rows : fks.error;
    throw new Error(`Failed deleting user ${user.display_id}: ${del.error}`);
  }
  report.deleted = true;
  report.row = del.rows[0];
  return report;
}

async function main() {
  if (!IDS.length) {
    console.error('Usage: node backend/scripts/delete-users-by-display-id.js <display_id> [display_id2 ...]');
    process.exit(1);
  }

  const found = await db.query(
    `SELECT id, email, phone, first_name, last_name, role, display_id, is_active, created_at
     FROM users
     WHERE CAST(display_id AS TEXT) = ANY($1::text[])
     ORDER BY display_id`,
    [IDS]
  );

  console.log('Requested:', IDS);
  console.log(
    'Found:',
    found.rows.map((u) => ({
      display_id: u.display_id,
      email: u.email,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      role: u.role,
      id: u.id,
    }))
  );

  const missing = IDS.filter((id) => !found.rows.some((u) => String(u.display_id) === id));
  if (missing.length) console.warn('Not found:', missing);
  if (!found.rows.length) {
    await db.pool.end();
    process.exit(2);
  }

  const client = await db.pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const user of found.rows) {
      results.push(await deleteOne(client, user));
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete failed, rolled back:', err.message);
    console.log(JSON.stringify({ ok: false, results }, null, 2));
    throw err;
  } finally {
    client.release();
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    await db.pool.end();
  } catch (_e) {
    /* ignore */
  }
  process.exit(1);
});
