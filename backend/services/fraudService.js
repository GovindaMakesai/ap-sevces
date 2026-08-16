const db = require('../config/database');
const redis = require('../lib/redis');

async function flagUser(userId, flagType, severity = 'medium', metadata = {}) {
  const res = await db.query(
    `INSERT INTO fraud_flags (user_id, flag_type, severity, metadata) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, flagType, severity, JSON.stringify(metadata)]
  );
  return res.rows[0];
}

async function checkRechargeAbuse(userId) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS c FROM recharges
     WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
    [userId]
  );
  if (res.rows[0].c >= 5) {
    await flagUser(userId, 'recharge_velocity', 'high', { count: res.rows[0].c });
    const err = new Error('Too many recharge requests. Please wait before submitting again.');
    err.code = 'RECHARGE_RATE_LIMIT';
    throw err;
  }
  return false;
}

/** Burst sends per minute — high enough for combo / send-all in live rooms. */
const GIFT_BURST_MAX = Number(process.env.GIFT_BURST_MAX) || 120;
/** Flag only — do not block legitimate whale gifts (yacht, castle, etc.). */
const GIFT_FLAG_AMOUNT = Number(process.env.GIFT_FLAG_AMOUNT) || 50000000;

async function checkGiftAbuse(senderId, amount) {
  const key = `gift:burst:${senderId}`;
  const count = await redis.incr(key, 60);
  const coinAmount = Number(amount) || 0;

  if (coinAmount > GIFT_FLAG_AMOUNT) {
    await flagUser(senderId, 'gift_high_value', 'medium', { count, amount: coinAmount });
  }

  if (count > GIFT_BURST_MAX) {
    await flagUser(senderId, 'gift_abuse', 'medium', { count, amount: coinAmount });
    const err = new Error('Gift rate limit exceeded. Please try again later.');
    err.code = 'GIFT_RATE_LIMIT';
    throw err;
  }
  return false;
}

async function checkDuplicateAccount(email, phone) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS c FROM users WHERE email = $1 OR phone = $2`,
    [email, phone]
  );
  return res.rows[0].c > 1;
}

async function listOpenFlags(limit = 50) {
  const res = await db.query(
    `SELECT ff.*, u.email, u.first_name FROM fraud_flags ff
     LEFT JOIN users u ON u.id = ff.user_id
     WHERE ff.status = 'open' ORDER BY ff.created_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function assertNotBlocked(userId, _context = '') {
  const res = await db.query(
    `SELECT 1 FROM fraud_flags
     WHERE user_id = $1 AND status = 'open' AND severity IN ('high', 'critical') LIMIT 1`,
    [userId]
  );
  if (res.rows.length) {
    const err = new Error('Account restricted due to fraud review');
    err.code = 'FRAUD_BLOCKED';
    throw err;
  }
}

module.exports = {
  flagUser,
  checkRechargeAbuse,
  checkGiftAbuse,
  checkDuplicateAccount,
  listOpenFlags,
  assertNotBlocked,
};
