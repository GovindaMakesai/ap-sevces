const db = require('../config/database');

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
    `SELECT id, user_id, amount, status, method, admin_notes, reviewed_at, created_at
     FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return res.rows;
}

async function createRechargeRequest(userId, { amount_inr, payment_method, transaction_id }) {
  if (!amount_inr || amount_inr <= 0) throw new Error('Invalid recharge amount');
  if (!transaction_id || !String(transaction_id).trim()) {
    throw new Error('Payment reference (UTR) is required');
  }

  const res = await db.query(
    `INSERT INTO recharges (user_id, amount_inr, payment_method, transaction_id, payment_status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
    [userId, amount_inr, payment_method || 'qr_manual', String(transaction_id).trim()]
  );
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
  return res.rows[0];
}

async function approveWithdrawal(withdrawalId, adminUserId, notes) {
  const res = await db.query(
    `UPDATE withdrawals SET status = 'completed', reviewed_by = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND status = 'pending' RETURNING *`,
    [adminUserId, notes || null, withdrawalId]
  );
  if (!res.rows.length) throw new Error('Withdrawal not found or already processed');
  return res.rows[0];
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

    await walletService.creditCoins(
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
    `SELECT r.*, u.email, u.first_name, u.last_name
     FROM recharges r JOIN users u ON u.id = r.user_id
     WHERE r.payment_status = 'pending' ORDER BY r.created_at ASC LIMIT $1`,
    [limit]
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
  return res.rows;
}

module.exports = {
  listTransactions,
  listWithdrawals,
  createRechargeRequest,
  approveRecharge,
  rejectRecharge,
  approveWithdrawal,
  rejectWithdrawal,
  listPendingRecharges,
  listPendingWithdrawals,
};
