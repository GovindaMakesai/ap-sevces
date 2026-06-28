const db = require('../config/database');

const DEFAULT_SETTINGS = {
  min_withdrawal_usd: 10,
  min_withdrawal_coins: 8300,
  gift_platform_fee_pct: 20,
  coins_per_inr: 10,
  inr_per_usd: 83,
};

function resolveMinWithdrawalCoins(settings) {
  const usd = Number(settings.min_withdrawal_usd);
  if (Number.isFinite(usd) && usd > 0) {
    const inrPerUsd = Number(settings.inr_per_usd || 83);
    const coinsPerInr = Number(settings.coins_per_inr || 10);
    return Math.ceil(usd * inrPerUsd * coinsPerInr);
  }
  return Number(settings.min_withdrawal_coins || 500);
}

function formatMinWithdrawalMessage(settings) {
  const minPoints = resolveMinWithdrawalCoins(settings);
  const usd = Number(settings.min_withdrawal_usd);
  if (Number.isFinite(usd) && usd > 0) {
    return `Minimum withdrawal is ${minPoints.toLocaleString('en-US')} points ($${usd})`;
  }
  return `Minimum withdrawal is ${minPoints.toLocaleString('en-US')} points`;
}

async function getWalletSettings() {
  const res = await db.query(`SELECT value FROM platform_settings WHERE key = 'wallet' LIMIT 1`);
  const merged = { ...DEFAULT_SETTINGS, ...(res.rows[0]?.value || {}) };
  return {
    ...merged,
    min_withdrawal_coins: resolveMinWithdrawalCoins(merged),
  };
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

  if (client) {
    return run(client);
  }
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const result = await run(c);
    await c.query('COMMIT');
    if (Number(result.balance) >= 100000) {
      setImmediate(() => {
        try {
          const { ensureSellerAccess } = require('./coinSellerService');
          ensureSellerAccess(userId).catch(() => {});
        } catch (_e) { /* best-effort */ }
      });
    }
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

async function creditStars(userId, amount, meta = {}, client) {
  const amt = BigInt(amount);
  if (amt <= 0n) throw new Error('Credit amount must be positive');

  const run = async (c) => {
    const wallet = await getOrCreateWallet(userId, c);
    const newBal = BigInt(wallet.star_balance) + amt;
    await c.query(
      `UPDATE wallets SET star_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newBal.toString(), wallet.id]
    );
    const tx = await c.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
       VALUES ($1, $2, $3, 'star', $4, $5, 'completed', $6) RETURNING *`,
      [
        userId,
        meta.type || 'credit',
        amt.toString(),
        meta.reference_type || null,
        meta.reference_id || null,
        JSON.stringify(meta.metadata || {}),
      ]
    );
    return { star_balance: Number(newBal), transaction: tx.rows[0] };
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

async function debitStars(userId, amount, meta = {}, client) {
  const amt = BigInt(amount);
  if (amt <= 0n) throw new Error('Debit amount must be positive');

  const run = async (c) => {
    const wallet = await getOrCreateWallet(userId, c);
    const current = BigInt(wallet.star_balance);
    if (current < amt) {
      const err = new Error('Insufficient points balance');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    const newBal = current - amt;
    await c.query(
      `UPDATE wallets SET star_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newBal.toString(), wallet.id]
    );
    const tx = await c.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, reference_id, status, metadata)
       VALUES ($1, $2, $3, 'star', $4, $5, 'completed', $6) RETURNING *`,
      [
        userId,
        meta.type || 'debit',
        (-Number(amt)).toString(),
        meta.reference_type || null,
        meta.reference_id || null,
        JSON.stringify(meta.metadata || {}),
      ]
    );
    return { star_balance: Number(newBal), transaction: tx.rows[0] };
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

async function reserveWithdrawal(userId, amount, { qr_image_url, qr_asset_id, method } = {}) {
  const settings = await getWalletSettings();
  const amt = BigInt(amount);
  if (amt < BigInt(settings.min_withdrawal_coins)) {
    throw new Error(formatMinWithdrawalMessage(settings));
  }
  if (!qr_image_url || !String(qr_image_url).trim()) {
    throw new Error('Payment QR code image is required');
  }

  const amountInr = Number(amt) / Number(settings.coins_per_inr || 10);
  const orderNumber = generateOrderNumber();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await debitStars(userId, Number(amt), { type: 'withdrawal_hold', reference_type: 'withdrawal' }, client);
    const w = await client.query(
      `INSERT INTO withdrawals (user_id, amount, status, method, qr_image_url, qr_asset_id, order_number, amount_inr)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7) RETURNING *`,
      [userId, amt.toString(), method || 'qr_upi', String(qr_image_url).trim(), qr_asset_id || null, orderNumber, amountInr]
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
  creditStars,
  debitStars,
  reserveWithdrawal,
};
