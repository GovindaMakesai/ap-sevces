const db = require('../config/database');
const transactionService = require('./transactionService');
const auditLogService = require('./auditLogService');

const POLICY_VERSION = process.env.PRIVACY_POLICY_VERSION || '2026-06-01';
const TERMS_VERSION = process.env.TERMS_VERSION || '2026-06-01';

async function recordConsent(userId, consentType, version = POLICY_VERSION) {
  const res = await db.query(
    `INSERT INTO user_consents (user_id, consent_type, version)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, consent_type, version) DO UPDATE SET accepted_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, consentType, version]
  );
  return res.rows[0];
}

async function getConsents(userId) {
  const res = await db.query(
    `SELECT consent_type, version, accepted_at FROM user_consents WHERE user_id = $1 ORDER BY accepted_at DESC`,
    [userId]
  );
  return res.rows;
}

async function requestDeletion(userId, reason) {
  await db.query(
    `UPDATE users SET deletion_requested_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  await auditLogService.log(userId, 'account.deletion_requested', {
    entity_type: 'user',
    entity_id: userId,
    metadata: { reason: reason || null },
  });
  return { status: 'pending', retention_days: 30 };
}

async function softDeleteUser(userId, actorId) {
  await db.query(
    `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, is_active = FALSE, email = CONCAT('deleted_', id, '@deleted.local')
     WHERE id = $1`,
    [userId]
  );
  await auditLogService.log(actorId || userId, 'account.soft_deleted', {
    entity_type: 'user',
    entity_id: userId,
  });
  return { deleted: true };
}

async function exportAccountData(userId) {
  const [user, wallet, txns, giftsSent, giftsRecv, withdrawals, consents] = await Promise.all([
    db.query(
      `SELECT id, email, phone, first_name, last_name, role, created_at, deletion_requested_at FROM users WHERE id = $1`,
      [userId]
    ),
    db.query(`SELECT * FROM wallets WHERE user_id = $1`, [userId]),
    transactionService.listTransactions(userId, { limit: 500, offset: 0 }),
    db.query(`SELECT * FROM gift_transactions WHERE sender_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId]),
    db.query(`SELECT * FROM gift_transactions WHERE receiver_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId]),
    transactionService.listWithdrawals(userId),
    getConsents(userId),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    user: user.rows[0],
    wallet: wallet.rows[0],
    wallet_transactions: txns,
    gifts_sent: giftsSent.rows,
    gifts_received: giftsRecv.rows,
    withdrawals,
    consents,
    retention_policy: {
      soft_delete_grace_days: 30,
      financial_records_retained_years: 7,
    },
  };

  await db.query(
    `INSERT INTO account_export_requests (user_id, status, payload) VALUES ($1, 'ready', $2)`,
    [userId, JSON.stringify(payload)]
  );

  return payload;
}

module.exports = {
  POLICY_VERSION,
  TERMS_VERSION,
  recordConsent,
  getConsents,
  requestDeletion,
  softDeleteUser,
  exportAccountData,
};
