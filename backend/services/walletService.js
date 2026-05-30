const db = require('../config/database');

const DEFAULT_SETTINGS = {
  min_withdrawal_coins: 500,
  gift_platform_fee_pct: 20,
  coins_per_inr: 10,
};

async function getWalletSettings() {
  const res = await db.query(`SELECT value FROM platform_settings WHERE key = 'wallet' LIMIT 1`);
  return { ...DEFAULT_SETTINGS, ...(res.rows[0]?.value || {}) };
}

/**
 * Lock wallet row for atomic balance updates (prevents race conditions).
 */
async function getOrCreateWallet(userId, client = db) {
  const q = client.query.bind(client);
  let res = await q(
    `SELECT id, user_id, coin_balance, star_balance, created_at, updated_at
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (res.rows.length) return res.rows[0];

  await q(
    `INSERT INTO wallets (user_id, coin_balance, star_balance) VALUES ($1, 0, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  res = await q(
    `SELECT id, user_id, coin_balance, star_balance, created_at, updated_at
     FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  return res.rows[0];
}

async function getBalance(userId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const wallet = await getOrCreateWallet(userId, client);
    await client.query('COMMIT');
    return {
      coin_balance: Number(wallet.coin_balance),
      star_balance: Number(wallet.star_balance),
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function creditCoins(userId, amount, meta = {}, client) {
  const amt = BigInt(amount);
  if (amt <= 0n) throw new Error('Credit amount must be positive');

  const run = async (c) => {
    const wallet = await getOrCreateWallet(userId, c);
    const newBal = BigInt(wallet.coin_balance) + amt;
    await c.query(
      `UPDATE wallets SET coin_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newBal.toString(), wallet.id]
    );
    const tx = await c.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
       VALUES ($1, $2, $3, 'coin', $4, $5, 'completed', $6) RETURNING *`,
      [
        userId,
        meta.type || 'credit',
        amt.toString(),
        meta.reference_type || null,
        meta.reference_id || null,
        JSON.stringify(meta.metadata || {}),
      ]
    );
    return { balance: Number(newBal), transaction: tx.rows[0] };
  };

  if (client) return run(client);
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const result = await run(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function debitCoins(userId, amount, meta = {}, client) {
  const amt = BigInt(amount);
  if (amt <= 0n) throw new Error('Debit amount must be positive');

  const run = async (c) => {
    const wallet = await getOrCreateWallet(userId, c);
    const current = BigInt(wallet.coin_balance);
    if (current < amt) {
      const err = new Error('Insufficient coin balance');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    const newBal = current - amt;
    await c.query(
      `UPDATE wallets SET coin_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newBal.toString(), wallet.id]
    );
    const tx = await c.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
       VALUES ($1, $2, $3, 'coin', $4, $5, 'completed', $6) RETURNING *`,
      [
        userId,
        meta.type || 'debit',
        (-Number(amt)).toString(),
        meta.reference_type || null,
        meta.reference_id || null,
        JSON.stringify(meta.metadata || {}),
      ]
    );
    return { balance: Number(newBal), transaction: tx.rows[0] };
  };

  if (client) return run(client);
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const result = await run(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

function generateOrderNumber() {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0');
  return `${ts}${rand}`;
}

async function reserveWithdrawal(userId, amount, { qr_image_url, method } = {}) {
  const settings = await getWalletSettings();
  const amt = BigInt(amount);
  if (amt < BigInt(settings.min_withdrawal_coins)) {
    throw new Error(`Minimum withdrawal is ${settings.min_withdrawal_coins} coins`);
  }
  if (!qr_image_url || !String(qr_image_url).trim()) {
    throw new Error('Payment QR code image is required');
  }

  const amountInr = Number(amt) / Number(settings.coins_per_inr || 10);
  const orderNumber = generateOrderNumber();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await debitCoins(userId, Number(amt), { type: 'withdrawal_hold', reference_type: 'withdrawal' }, client);
    const w = await client.query(
      `INSERT INTO withdrawals (user_id, amount, status, method, qr_image_url, order_number, amount_inr)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6) RETURNING *`,
      [userId, amt.toString(), method || 'qr_upi', String(qr_image_url).trim(), orderNumber, amountInr]
    );
    await client.query('COMMIT');
    return w.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  getWalletSettings,
  getOrCreateWallet,
  getBalance,
  creditCoins,
  debitCoins,
  reserveWithdrawal,
};
