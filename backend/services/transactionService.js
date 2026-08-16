const db = require('../config/database');
const fileAssetService = require('./fileAssetService');

function enrichWithdrawalQr(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.qr_asset_id) {
    out.qr_image_url = fileAssetService.buildSignedUrl(out.qr_asset_id, 3600);
  } else if (out.qr_image_url) {
    const m = String(out.qr_image_url).match(/\/api\/files\/([a-f0-9-]+)/i);
    if (m) out.qr_image_url = fileAssetService.buildSignedUrl(m[1], 3600);
  }
  return out;
}

function enrichWithdrawals(rows) {
  return (rows || []).map(enrichWithdrawalQr);
}

async function listTransactions(userId, { limit = 30, offset = 0 } = {}) {
  const res = await db.query(
    `SELECT id, user_id, type, amount, currency_type, reference_type, reference_id, status, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return res.rows;
}

async function listWithdrawals(userId, { limit = 20, offset = 0 } = {}) {
  const res = await db.query(
    `SELECT id, user_id, amount, status, method, qr_image_url, order_number, amount_inr,
            admin_notes, reviewed_at, paid_at, confirmed_at, created_at
     FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return enrichWithdrawals(res.rows);
}

async function getWithdrawalById(withdrawalId, userId = null) {
  const params = [withdrawalId];
  let sql = `SELECT w.*, u.email, u.first_name, u.last_name
     FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE w.id = $1`;
  if (userId) {
    sql += ` AND w.user_id = $2`;
    params.push(userId);
  }
  const res = await db.query(sql, params);
  return enrichWithdrawalQr(res.rows[0] || null);
}

function normalizeUtr(raw) {
  return String(raw || '').trim().replace(/\s+/g, '');
}

function validateUtr(utr) {
  if (!utr) throw new Error('Payment reference (UTR) is required');
  if (!/^\d{10,22}$/.test(utr)) {
    throw new Error('UTR must be 10–22 digits (check your UPI payment receipt)');
  }
}

async function createRechargeRequest(userId, { amount_inr, payment_method, transaction_id, payment_proof_asset_id }) {
  if (!amount_inr || amount_inr <= 0) throw new Error('Invalid recharge amount');
  const utr = normalizeUtr(transaction_id);
  validateUtr(utr);

  const fraudService = require('./fraudService');
  await fraudService.checkRechargeAbuse(userId);

  const dup = await db.query(
    `SELECT id FROM recharges
     WHERE LOWER(TRIM(transaction_id)) = LOWER($1)
       AND payment_status NOT IN ('rejected', 'failed')
     LIMIT 1`,
    [utr]
  );
  if (dup.rows.length) {
    throw new Error('This payment reference was already submitted');
  }

  const res = await db.query(
    `INSERT INTO recharges (user_id, amount_inr, payment_method, transaction_id, payment_status, payment_proof_asset_id)
     VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
    [userId, amount_inr, payment_method || 'qr_manual', utr, payment_proof_asset_id || null]
  );
  try {
    await require('./adminNotificationService').notifyAllAdmins({
      type: 'recharge',
      title: 'New coin recharge pending',
      message: `₹${Number(amount_inr).toLocaleString('en-IN')} recharge submitted — review Payment Approvals.`,
      data: { recharge_id: res.rows[0].id, user_id: userId },
      excludeUserIds: [userId],
    });
  } catch (_e) {
    /* non-fatal */
  }
  return res.rows[0];
}

async function approveRecharge(rechargeId, adminUserId, notes) {
  const client = await db.pool.connect();
  const walletService = require('./walletService');
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT * FROM recharges WHERE id = $1 FOR UPDATE`,
      [rechargeId]
    );
    if (!r.rows.length) throw new Error('Recharge not found');
    const recharge = r.rows[0];
    if (recharge.payment_status !== 'pending') throw new Error('Recharge already processed');

    const settings = await walletService.getWalletSettings();
    const coins = Math.floor(Number(recharge.amount_inr) * settings.coins_per_inr);

    await walletService.creditCoins(
      recharge.user_id,
      coins,
      {
        type: 'recharge',
        reference_type: 'recharge',
        reference_id: recharge.id,
        metadata: { amount_inr: recharge.amount_inr, transaction_id: recharge.transaction_id },
      },
      client
    );

    await client.query(
      `UPDATE recharges SET payment_status = 'approved', coins_credited = $1,
       admin_reviewed_by = $2, admin_notes = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [coins, adminUserId, notes || null, rechargeId]
    );
    await client.query('COMMIT');

    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: recharge.user_id,
      type: 'recharge',
      title: 'Coins credited',
      message: `${coins.toLocaleString()} coins added to your wallet.`,
      data: { recharge_id: rechargeId, coins_credited: coins },
    });

    const systemMessageService = require('./systemMessageService');
    await systemMessageService.notifyCoinsCredited(recharge.user_id, coins, {
      amountInr: recharge.amount_inr,
      source: 'recharge',
    });

    const svipService = require('./svipService');
    svipService.scheduleSvipRefresh(recharge.user_id);

    return { coins_credited: coins };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function rejectRecharge(rechargeId, adminUserId, notes) {
  const res = await db.query(
    `UPDATE recharges SET payment_status = 'rejected', admin_reviewed_by = $1, admin_notes = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND payment_status = 'pending' RETURNING *`,
    [adminUserId, notes || null, rechargeId]
  );
  if (!res.rows.length) throw new Error('Recharge not found or already processed');

  const Notification = require('../models/Notification');
  await Notification.create({
    user_id: res.rows[0].user_id,
    type: 'recharge',
    title: 'Recharge not approved',
    message: notes || 'Your payment could not be verified. Contact support if you believe this is an error.',
    data: { recharge_id: rechargeId, status: 'rejected' },
  });

  const systemMessageService = require('./systemMessageService');
  await systemMessageService.notifyRechargeRejected(res.rows[0].user_id, { reason: notes });

  return res.rows[0];
}

/** Admin marks payment sent — user must confirm receipt to complete. */
async function markWithdrawalPaid(withdrawalId, adminUserId, notes) {
  const res = await db.query(
    `UPDATE withdrawals SET status = 'paid', reviewed_by = $1, admin_notes = $2,
       reviewed_at = CURRENT_TIMESTAMP, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND status = 'pending' RETURNING *`,
    [adminUserId, notes || null, withdrawalId]
  );
  if (!res.rows.length) throw new Error('Withdrawal not found or already processed');

  const row = res.rows[0];
  const Notification = require('../models/Notification');
  await Notification.create({
    user_id: row.user_id,
    type: 'withdrawal',
    title: 'Withdrawal paid',
    message: `Admin sent ₹${Number(row.amount_inr || 0).toFixed(2)} — open Withdraw details to confirm receipt.`,
    data: { withdrawal_id: row.id, status: 'paid' },
  });

  const systemMessageService = require('./systemMessageService');
  await systemMessageService.notifyWithdrawalPaid(row.user_id, {
    amount: row.amount,
    amountInr: row.amount_inr,
  });

  return enrichWithdrawalQr(row);
}

async function confirmWithdrawalReceipt(withdrawalId, userId) {
  const res = await db.query(
    `UPDATE withdrawals SET status = 'completed', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND status = 'paid' RETURNING *`,
    [withdrawalId, userId]
  );
  if (!res.rows.length) throw new Error('Withdrawal not found or not awaiting confirmation');
  const row = res.rows[0];

  const systemMessageService = require('./systemMessageService');
  await systemMessageService.notifyWithdrawalCompleted(row.user_id, {
    amount: row.amount,
    amountInr: row.amount_inr,
  });

  return row;
}

async function rejectWithdrawal(withdrawalId, adminUserId, notes) {
  const client = await db.pool.connect();
  const walletService = require('./walletService');
  try {
    await client.query('BEGIN');
    const w = await client.query(`SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE`, [withdrawalId]);
    if (!w.rows.length) throw new Error('Withdrawal not found');
    const withdrawal = w.rows[0];
    if (withdrawal.status !== 'pending') throw new Error('Withdrawal already processed');

    await walletService.creditStars(
      withdrawal.user_id,
      Number(withdrawal.amount),
      { type: 'withdrawal_refund', reference_type: 'withdrawal', reference_id: withdrawal.id },
      client
    );

    await client.query(
      `UPDATE withdrawals SET status = 'rejected', reviewed_by = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [adminUserId, notes || null, withdrawalId]
    );
    await client.query('COMMIT');

    const systemMessageService = require('./systemMessageService');
    await systemMessageService.notifyWithdrawalRejected(withdrawal.user_id, {
      amount: withdrawal.amount,
      reason: notes,
    });

    return withdrawal;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listPendingRecharges(limit = 50) {
  const res = await db.query(
    `SELECT r.*,
            u.id AS user_uuid,
            u.email, u.first_name, u.last_name, u.phone, u.profile_pic,
            cp.name AS package_name,
            cp.coins AS package_coins,
            cp.bonus_coins AS package_bonus
     FROM recharges r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN coin_packages cp ON cp.price_inr = r.amount_inr AND cp.is_active = TRUE
     WHERE r.payment_status = 'pending'
     ORDER BY r.created_at ASC
     LIMIT $1`,
    [limit]
  );
  const walletService = require('./walletService');
  const settings = await walletService.getWalletSettings();
  const rate = settings.coins_per_inr || 10;
  return res.rows.map((row) => {
    const pkgCoins = row.package_coins != null ? Number(row.package_coins) + Number(row.package_bonus || 0) : null;
    const estimatedCoins = pkgCoins ?? Math.floor(Number(row.amount_inr) * rate);
    return {
      ...row,
      request_type: 'coin_recharge',
      request_type_label: 'Coin Recharge',
      user_id: row.user_uuid,
      estimated_coins: estimatedCoins,
      package_label: row.package_name || `₹${Number(row.amount_inr).toLocaleString('en-IN')} package`,
    };
  });
}

async function listUserRecharges(userId, { limit = 30 } = {}) {
  const res = await db.query(
    `SELECT id, amount_inr, payment_method, transaction_id, payment_status,
            coins_credited, admin_notes, created_at, updated_at
     FROM recharges
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

async function listPendingWithdrawals(limit = 50) {
  const res = await db.query(
    `SELECT w.*, u.email, u.first_name, u.last_name
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'pending' ORDER BY w.created_at ASC LIMIT $1`,
    [limit]
  );
  return enrichWithdrawals(res.rows);
}

async function listAwaitingConfirmWithdrawals(limit = 50) {
  const res = await db.query(
    `SELECT w.*, u.email, u.first_name, u.last_name
     FROM withdrawals w JOIN users u ON u.id = w.user_id
     WHERE w.status = 'paid' ORDER BY w.paid_at ASC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

module.exports = {
  listTransactions,
  listWithdrawals,
  getWithdrawalById,
  enrichWithdrawalQr,
  enrichWithdrawals,
  createRechargeRequest,
  approveRecharge,
  rejectRecharge,
  markWithdrawalPaid,
  confirmWithdrawalReceipt,
  rejectWithdrawal,
  listPendingRecharges,
  listUserRecharges,
  listPendingWithdrawals,
  listAwaitingConfirmWithdrawals,
  normalizeUtr,
  validateUtr,
};
