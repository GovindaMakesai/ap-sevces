/**
 * Transfer all app data from one user account to another (or create client account).
 *
 * Usage (dry-run — safe, no changes):
 *   node backend/scripts/transfer-user-data.js \
 *     --from developer.govinda00@gmail.com \
 *     --to-email client@example.com \
 *     --to-phone 9876543210 \
 *     --to-first Client \
 *     --to-last Name \
 *     --to-password 'SecurePass123!'
 *
 * Apply changes:
 *   node backend/scripts/transfer-user-data.js ...same args... --execute
 *
 * If client account already exists, only pass --from and --to-email (no create fields).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('../config/database');

function parseArgs(argv) {
  const out = { execute: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') out.execute = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = argv[++i];
    }
  }
  return out;
}

async function countForUser(client, userId, sql) {
  const res = await client.query(sql, [userId]);
  return res.rows[0].n;
}

async function auditUser(client, userId) {
  const checks = [
    ['wallets', 'SELECT COUNT(*)::int AS n FROM wallets WHERE user_id = $1'],
    ['wallet_transactions', 'SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE user_id = $1'],
    ['recharges', 'SELECT COUNT(*)::int AS n FROM recharges WHERE user_id = $1'],
    ['withdrawals', 'SELECT COUNT(*)::int AS n FROM withdrawals WHERE user_id = $1'],
    ['gift_sent', 'SELECT COUNT(*)::int AS n FROM gift_transactions WHERE sender_id = $1'],
    ['gift_received', 'SELECT COUNT(*)::int AS n FROM gift_transactions WHERE receiver_id = $1'],
    ['live_rooms_host', 'SELECT COUNT(*)::int AS n FROM live_rooms WHERE host_user_id = $1'],
    ['bookings_customer', 'SELECT COUNT(*)::int AS n FROM bookings WHERE customer_id = $1'],
    ['user_roles', 'SELECT COUNT(*)::int AS n FROM user_roles WHERE user_id = $1'],
    ['notifications', 'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1'],
    ['user_follows_out', 'SELECT COUNT(*)::int AS n FROM user_follows WHERE follower_id = $1'],
    ['user_follows_in', 'SELECT COUNT(*)::int AS n FROM user_follows WHERE following_id = $1'],
  ];
  const summary = {};
  for (const [name, sql] of checks) {
    try {
      summary[name] = await countForUser(client, userId, sql);
    } catch {
      summary[name] = 'n/a';
    }
  }
  const wallet = await client.query(
    'SELECT coin_balance, star_balance FROM wallets WHERE user_id = $1',
    [userId]
  );
  summary.wallet = wallet.rows[0] || { coin_balance: 0, star_balance: 0 };
  return summary;
}

async function ensureTargetUser(client, args, fromUser) {
  if (args.toEmail) {
    const existing = await client.query('SELECT * FROM users WHERE email ILIKE $1', [args.toEmail]);
    if (existing.rows[0]) return existing.rows[0];
  }

  if (!args.toEmail || !args.toPhone || !args.toFirst || !args.toLast || !args.toPassword) {
    throw new Error(
      'Target user not found. Provide --to-email, --to-phone, --to-first, --to-last, --to-password to create one.'
    );
  }

  const phoneTaken = await client.query('SELECT id FROM users WHERE phone = $1', [args.toPhone]);
  if (phoneTaken.rows[0]) throw new Error(`Phone already used: ${args.toPhone}`);

  const passwordHash = await bcrypt.hash(args.toPassword, 10);
  const created = await client.query(
    `INSERT INTO users (email, phone, password_hash, first_name, last_name, role, is_verified, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true, true)
     RETURNING *`,
    [args.toEmail, args.toPhone, passwordHash, args.toFirst, args.toLast, fromUser.role || 'customer']
  );
  return created.rows[0];
}

async function mergeWallets(client, fromId, toId) {
  await client.query(
    `INSERT INTO wallets (user_id, coin_balance, star_balance) VALUES ($1, 0, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [toId]
  );
  const src = await client.query('SELECT coin_balance, star_balance FROM wallets WHERE user_id = $1', [fromId]);
  if (!src.rows[0]) return { merged: false };
  const { coin_balance, star_balance } = src.rows[0];
  await client.query(
    `UPDATE wallets
     SET coin_balance = coin_balance + $2,
         star_balance = star_balance + $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [toId, coin_balance, star_balance]
  );
  await client.query('DELETE FROM wallets WHERE user_id = $1', [fromId]);
  return { merged: true, coin_balance, star_balance };
}

async function runStep(client, updates, label, fn) {
  await client.query('SAVEPOINT transfer_step');
  try {
    const result = await fn();
    await client.query('RELEASE SAVEPOINT transfer_step');
    if (result) updates.push(result);
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT transfer_step');
    if (e.code === '42P01') {
      updates.push({ step: label, skipped: 'table missing' });
      return;
    }
    throw new Error(`${label}: ${e.message}`);
  }
}

async function transferUserData(client, fromId, toId) {
  const updates = [];

  const simple = [
    ['wallet_transactions', 'user_id'],
    ['recharges', 'user_id'],
    ['withdrawals', 'user_id'],
    ['notifications', 'user_id'],
    ['payment_intents', 'user_id'],
    ['moderation_reports', 'reporter_id'],
    ['moderation_reports', 'reported_user_id'],
    ['coin_seller_orders', 'buyer_id'],
    ['coin_seller_orders', 'seller_id'],
    ['gift_transactions', 'sender_id'],
    ['gift_transactions', 'receiver_id'],
    ['live_rooms', 'host_user_id'],
    ['bookings', 'customer_id'],
    ['reviews', 'customer_id'],
  ];

  for (const [table, column] of simple) {
    await runStep(client, updates, `${table}.${column}`, async () => {
      const res = await client.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
        [toId, fromId]
      );
      return res.rowCount ? { table, column, rows: res.rowCount } : null;
    });
  }

  await runStep(client, updates, 'live_room_bans', async () => {
    await client.query(
      `DELETE FROM live_room_bans src
       USING live_room_bans existing
       WHERE src.user_id = $1
         AND existing.user_id = $2
         AND src.live_room_id = existing.live_room_id`,
      [fromId, toId]
    );
    const res = await client.query(
      `UPDATE live_room_bans SET user_id = $1 WHERE user_id = $2`,
      [toId, fromId]
    );
    const by = await client.query(
      `UPDATE live_room_bans SET banned_by = $1 WHERE banned_by = $2`,
      [toId, fromId]
    );
    return {
      table: 'live_room_bans',
      rows: (res.rowCount || 0) + (by.rowCount || 0),
    };
  });

  await runStep(client, updates, 'live_room_members', async () => {
    await client.query(
      `DELETE FROM live_room_members src
       USING live_room_members existing
       WHERE src.user_id = $1
         AND existing.user_id = $2
         AND src.live_room_id = existing.live_room_id`,
      [fromId, toId]
    );
    const res = await client.query(
      `UPDATE live_room_members SET user_id = $1 WHERE user_id = $2`,
      [toId, fromId]
    );
    return res.rowCount ? { table: 'live_room_members', rows: res.rowCount } : null;
  });

  await runStep(client, updates, 'user_follows', async () => {
    await client.query(
      `DELETE FROM user_follows
       WHERE follower_id = $1
         AND following_id IN (SELECT following_id FROM user_follows WHERE follower_id = $2)`,
      [fromId, toId]
    );
    await client.query(
      `DELETE FROM user_follows
       WHERE following_id = $1
         AND follower_id IN (SELECT follower_id FROM user_follows WHERE following_id = $2)`,
      [fromId, toId]
    );
    await client.query('DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $1', [fromId]);
    await client.query('DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2', [fromId, toId]);
    await client.query('DELETE FROM user_follows WHERE follower_id = $2 AND following_id = $1', [fromId, toId]);
    const out = await client.query(
      `UPDATE user_follows SET follower_id = $1 WHERE follower_id = $2`,
      [toId, fromId]
    );
    const inn = await client.query(
      `UPDATE user_follows SET following_id = $1 WHERE following_id = $2`,
      [toId, fromId]
    );
    return { table: 'user_follows', rows: (out.rowCount || 0) + (inn.rowCount || 0) };
  });

  await runStep(client, updates, 'user_blocks', async () => {
    await client.query(
      `DELETE FROM user_blocks
       WHERE blocker_id = $1
         AND blocked_id IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = $2)`,
      [fromId, toId]
    );
    const out = await client.query(
      `UPDATE user_blocks SET blocker_id = $1 WHERE blocker_id = $2`,
      [toId, fromId]
    );
    const inn = await client.query(
      `UPDATE user_blocks SET blocked_id = $1 WHERE blocked_id = $2`,
      [toId, fromId]
    );
    return { table: 'user_blocks', rows: (out.rowCount || 0) + (inn.rowCount || 0) };
  });

  await runStep(client, updates, 'user_roles', async () => {
    const roles = await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, role_id FROM user_roles WHERE user_id = $2
       ON CONFLICT DO NOTHING`,
      [toId, fromId]
    );
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [fromId]);
    return { table: 'user_roles', rows: roles.rowCount };
  });

  await runStep(client, updates, 'user_notification_settings', async () => {
    const hasTargetSettings = await client.query(
      'SELECT 1 FROM user_notification_settings WHERE user_id = $1',
      [toId]
    );
    if (!hasTargetSettings.rows.length) {
      const res = await client.query(
        'UPDATE user_notification_settings SET user_id = $1 WHERE user_id = $2',
        [toId, fromId]
      );
      return { table: 'user_notification_settings', rows: res.rowCount };
    }
    await client.query('DELETE FROM user_notification_settings WHERE user_id = $1', [fromId]);
    return { table: 'user_notification_settings', rows: 'deleted source' };
  });

  await runStep(client, updates, 'workers', async () => {
    const worker = await client.query('SELECT id FROM workers WHERE user_id = $1', [fromId]);
    const targetWorker = await client.query('SELECT id FROM workers WHERE user_id = $1', [toId]);
    if (worker.rows[0] && !targetWorker.rows[0]) {
      const res = await client.query('UPDATE workers SET user_id = $1 WHERE user_id = $2', [toId, fromId]);
      return { table: 'workers', rows: res.rowCount };
    }
    return null;
  });

  return updates;
}

async function deactivateSourceUser(client, fromId) {
  await client.query(
    `UPDATE users
     SET is_active = false,
         email = CONCAT('transferred_', id::text, '@inactive.local'),
         phone = CONCAT('9', RIGHT(REPLACE(id::text, '-', ''), 9)),
         provider = NULL,
         provider_id = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [fromId]
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.from) {
    console.error('Missing --from <source-email>');
    process.exit(1);
  }
  if (!args.toEmail) {
    console.error('Missing --to-email <client-email>');
    process.exit(1);
  }

  const client = await db.pool.connect();
  try {
    const fromRes = await client.query('SELECT * FROM users WHERE email ILIKE $1', [args.from]);
    const fromUser = fromRes.rows[0];
    if (!fromUser) throw new Error(`Source user not found: ${args.from}`);

    const before = await auditUser(client, fromUser.id);
    const existingTarget = await client.query('SELECT * FROM users WHERE email ILIKE $1', [args.toEmail]);
    const targetPreview = existingTarget.rows[0]
      ? { action: 'use_existing', email: existingTarget.rows[0].email, id: existingTarget.rows[0].id }
      : {
          action: 'create_new',
          email: args.toEmail,
          phone: args.toPhone,
          name: `${args.toFirst || ''} ${args.toLast || ''}`.trim(),
        };

    const plan = {
      mode: args.execute ? 'EXECUTE' : 'DRY_RUN',
      from: { id: fromUser.id, email: fromUser.email, phone: fromUser.phone, role: fromUser.role },
      to: targetPreview,
      source_data: before,
      steps: [
        'Create or locate client account',
        'Merge wallet balances into client wallet',
        'Reassign recharges, live rooms, bookings, gifts, follows, etc.',
        'Copy RBAC roles to client',
        'Deactivate old account (email/phone freed, marked inactive)',
        args.toPhone ? `Set client phone to ${args.toPhone}` : null,
      ].filter(Boolean),
    };

    if (!args.execute) {
      console.log(JSON.stringify(plan, null, 2));
      console.log('\nNo changes made. Re-run with --execute to apply.');
      return;
    }

    await client.query('BEGIN');

    const toUser = await ensureTargetUser(client, args, fromUser);
    if (toUser.id === fromUser.id) throw new Error('Source and target are the same user');

    const walletMerge = await mergeWallets(client, fromUser.id, toUser.id);
    const updates = await transferUserData(client, fromUser.id, toUser.id);
    await deactivateSourceUser(client, fromUser.id);

    if (args.toPhone) {
      const phoneTaken = await client.query(
        'SELECT id FROM users WHERE phone = $1 AND id <> $2',
        [args.toPhone, toUser.id]
      );
      if (phoneTaken.rows[0]) {
        throw new Error(`Phone ${args.toPhone} still in use by another account`);
      }
      await client.query(
        'UPDATE users SET phone = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [args.toPhone, toUser.id]
      );
      toUser.phone = args.toPhone;
    }

    const after = await auditUser(client, toUser.id);

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          success: true,
          from_deactivated: fromUser.email,
          to_account: { id: toUser.id, email: toUser.email, phone: toUser.phone },
          wallet_merge: walletMerge,
          updates,
          client_data_after: after,
        },
        null,
        2
      )
    );
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('Transfer failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
