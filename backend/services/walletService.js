const db = require('../config/database');

const DEFAULT_SETTINGS = {
  min_withdrawal_usd: 10,
  /** 100,000 points = $10 (authoritative withdrawal FX; not used for coin recharge). */
  withdrawal_points_per_usd: 10000,
  min_withdrawal_coins: 100000,
  /** Service fee deducted from cash payout (points still fully deducted). */
  withdrawal_service_fee_pct: 8,
  gift_platform_fee_pct: 20,
  /** Recharge: coins credited per ₹1 spent. Must not drive withdrawal FX. */
  coins_per_inr: 10,
  /** USD→INR for withdrawal payout estimates (locked rate). */
  inr_per_usd: 94,
  /** User exchange: points → NR coins (anyone with wallet.withdraw). */
  exchange_points_block: 100000,
  /** Coins credited per 10,000 points (Zero seller rate = 70%). */
  exchange_coins_per_10k_points: 7000,
  /** Points transfer to agency / coin seller — multiples only. */
  points_transfer_block: 100000,
  points_transfer_service_fee_pct: 3,
  points_transfer_daily_limit: 5,
};

function resolveWithdrawalPointsPerUsd(settings) {
  const pts = Number(settings.withdrawal_points_per_usd);
  if (Number.isFinite(pts) && pts > 0) return pts;
  return 10000;
}

function resolveWithdrawalServiceFeePct(settings) {
  const pct = Number(settings.withdrawal_service_fee_pct);
  if (Number.isFinite(pct) && pct >= 0 && pct < 100) return pct;
  return 8;
}

function resolveMinWithdrawalCoins(settings) {
  const usd = Number(settings.min_withdrawal_usd);
  const ptsPerUsd = resolveWithdrawalPointsPerUsd(settings);
  if (Number.isFinite(usd) && usd > 0) {
    return Math.ceil(usd * ptsPerUsd);
  }
  const fallback = Number(settings.min_withdrawal_coins);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 100000;
}

function pointsToWithdrawalUsdGross(points, settings) {
  return Number(points) / resolveWithdrawalPointsPerUsd(settings);
}

function applyWithdrawalServiceFee(amount, settings) {
  const pct = resolveWithdrawalServiceFeePct(settings);
  return Number(amount) * (1 - pct / 100);
}

/** Net USD payout after 8% (or configured) service fee. */
function pointsToWithdrawalUsd(points, settings) {
  return applyWithdrawalServiceFee(pointsToWithdrawalUsdGross(points, settings), settings);
}

function pointsToWithdrawalInrGross(points, settings) {
  const inrPerUsd = Number(settings.inr_per_usd || 94);
  return pointsToWithdrawalUsdGross(points, settings) * inrPerUsd;
}

/** Net INR payout after service fee. */
function pointsToWithdrawalInr(points, settings) {
  return applyWithdrawalServiceFee(pointsToWithdrawalInrGross(points, settings), settings);
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
  const block = Number(merged.exchange_points_block);
  const coinsPer10k = Number(merged.exchange_coins_per_10k_points);
  return {
    ...merged,
    withdrawal_points_per_usd: resolveWithdrawalPointsPerUsd(merged),
    withdrawal_service_fee_pct: resolveWithdrawalServiceFeePct(merged),
    min_withdrawal_coins: resolveMinWithdrawalCoins(merged),
    exchange_points_block: Number.isFinite(block) && block > 0 ? block : 100000,
    exchange_coins_per_10k_points:
      Number.isFinite(coinsPer10k) && coinsPer10k > 0 ? coinsPer10k : 7000,
    points_transfer_block:
      Number(merged.points_transfer_block) > 0 ? Number(merged.points_transfer_block) : 100000,
    points_transfer_service_fee_pct:
      Number.isFinite(Number(merged.points_transfer_service_fee_pct)) &&
      Number(merged.points_transfer_service_fee_pct) >= 0
        ? Number(merged.points_transfer_service_fee_pct)
        : 3,
    points_transfer_daily_limit:
      Number(merged.points_transfer_daily_limit) > 0
        ? Number(merged.points_transfer_daily_limit)
        : 5,
  };
}

/**
 * Lock wallet row for atomic balance updates (prevents race conditions).
 * FOR UPDATE is only used inside an explicit pool transaction — never on autocommit pool.query.
 */
function isTxnClient(client) {
  return Boolean(client && typeof client.release === 'function');
}

async function getOrCreateWallet(userId, client = db) {
  const q = client.query.bind(client);
  const lock = isTxnClient(client) ? ' FOR UPDATE' : '';
  let res = await q(
    `SELECT id, user_id, coin_balance, star_balance, created_at, updated_at
     FROM wallets WHERE user_id = $1${lock}`,
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
     FROM wallets WHERE user_id = $1${lock}`,
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
    await db.safeRollback(client);
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
    return result;
  } catch (e) {
    await db.safeRollback(c);
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
    await db.safeRollback(c);
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
    await db.safeRollback(c);
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
    await db.safeRollback(c);
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

  const amountInr = Math.round(pointsToWithdrawalInr(Number(amt), settings) * 100) / 100;
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
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Points transfer to agency / coin seller.
 */
function resolvePointsTransferBlock(settings) {
  const block = Number(settings?.points_transfer_block);
  return Number.isFinite(block) && block > 0 ? block : 100000;
}

function resolvePointsTransferFeePct(settings) {
  const pct = Number(settings?.points_transfer_service_fee_pct);
  return Number.isFinite(pct) && pct >= 0 && pct < 100 ? pct : 3;
}

function computePointsTransferFee(points, settings) {
  const pct = resolvePointsTransferFeePct(settings);
  return Math.floor((Number(points) * pct) / 100);
}

function pointsToSellerCoins(netPoints, settings) {
  const coinsPer10k = Number(settings?.exchange_coins_per_10k_points) || 7000;
  const pts = Math.floor(Number(netPoints) || 0);
  if (pts <= 0) return 0;
  return Math.floor((pts / 10000) * coinsPer10k);
}

async function lookupPointsTransferRecipient(accountId) {
  const coinSellerService = require('./coinSellerService');
  const user = await coinSellerService.lookupRecipient(accountId);
  if (!user) return null;

  const sellerRes = await db.query(
    `SELECT user_id, is_active FROM coin_seller_profiles WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );
  const isActiveSeller = sellerRes.rows[0]?.is_active === true;
  const isCoinSellerRole = String(user.role || '').toLowerCase() === 'coin_seller';
  if (!isActiveSeller && !isCoinSellerRole) return null;

  return { ...user, recipient_type: 'coin_seller' };
}

async function countPointsTransfersToday(senderId) {
  const ok = await require('../config/ensurePointsTransferSchema').ensurePointsTransferSchema();
  if (!ok) return 0;
  try {
    const res = await db.query(
      `SELECT COUNT(*)::int AS n FROM points_transfers
       WHERE sender_id = $1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [senderId]
    );
    return res.rows[0]?.n || 0;
  } catch (err) {
    if (/points_transfers|does not exist/i.test(err.message || '')) return 0;
    throw err;
  }
}

async function listPointsTransfers(senderId, { limit = 30 } = {}) {
  const ok = await require('../config/ensurePointsTransferSchema').ensurePointsTransferSchema();
  if (!ok) return [];
  try {
    const res = await db.query(
      `SELECT t.*, u.first_name, u.last_name, u.profile_pic, u.display_id
       FROM points_transfers t
       JOIN users u ON u.id = t.recipient_id
       WHERE t.sender_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [senderId, limit]
    );
    return res.rows;
  } catch (err) {
    if (/points_transfers|does not exist/i.test(err.message || '')) return [];
    throw err;
  }
}

async function transferPointsToRecipient(senderId, { recipientId, points: pointsRaw }) {
  const { ensurePointsTransferSchema } = require('../config/ensurePointsTransferSchema');
  const schemaOk = await ensurePointsTransferSchema();
  if (!schemaOk) {
    throw new Error('Transfer service is starting up. Please try again in a moment.');
  }

  const settings = await getWalletSettings();
  const block = resolvePointsTransferBlock(settings);
  const dailyLimit = Number(settings.points_transfer_daily_limit) || 5;
  const points = parseInt(pointsRaw, 10);

  if (!points || points < block || points % block !== 0) {
    throw new Error(`Amount must be a multiple of ${block.toLocaleString('en-US')} points (1 lakh, 2 lakh, …)`);
  }
  if (!recipientId) throw new Error('Recipient ID is required');

  const recipient = await lookupPointsTransferRecipient(recipientId);
  if (!recipient) {
    throw new Error('Recipient must be an active Coin Seller');
  }
  if (String(recipient.id) === String(senderId)) {
    throw new Error('You cannot transfer points to yourself');
  }

  const usedToday = await countPointsTransfersToday(senderId);
  if (usedToday >= dailyLimit) {
    throw new Error(`Daily transfer limit reached (${dailyLimit} per day)`);
  }

  const serviceFee = computePointsTransferFee(points, settings);
  const netPoints = points - serviceFee;
  if (netPoints <= 0) throw new Error('Transfer amount too small after service fee');

  const coinsCredited = pointsToSellerCoins(netPoints, settings);
  if (coinsCredited <= 0) {
    throw new Error('Transfer amount too small to convert to seller coins');
  }

  const platformService = require('./platformService');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await debitStars(
      senderId,
      points,
      {
        type: 'points_transfer_out',
        reference_type: 'points_transfer',
        metadata: {
          recipient_id: recipient.id,
          recipient_type: 'coin_seller',
          service_fee: serviceFee,
          net_points: netPoints,
          coins_credited: coinsCredited,
        },
      },
      client
    );

    await client.query(
      `INSERT INTO coin_seller_profiles (user_id, display_name, inventory_coins, is_active)
       VALUES (
         $1,
         COALESCE(
           (SELECT NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), '')
            FROM users WHERE id = $1),
           'Coin Seller'
         ),
         0,
         TRUE
       )
       ON CONFLICT (user_id) DO NOTHING`,
      [recipient.id]
    );
    await client.query(
      `UPDATE coin_seller_profiles
       SET inventory_coins = inventory_coins + $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [recipient.id, coinsCredited]
    );

    if (serviceFee > 0) {
      const treasuryUserId = await platformService.getOrCreateTreasuryUserId(client);
      await creditStars(
        treasuryUserId,
        serviceFee,
        {
          type: 'points_transfer_fee',
          reference_type: 'points_transfer',
          metadata: { sender_id: senderId, recipient_id: recipient.id, gross_points: points },
        },
        client
      );
    }
    const row = await client.query(
      `INSERT INTO points_transfers (sender_id, recipient_id, points, service_fee, net_points, coins_credited, recipient_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'coin_seller') RETURNING *`,
      [senderId, recipient.id, points, serviceFee, netPoints, coinsCredited]
    );
    await client.query('COMMIT');
    const bal = await getBalance(senderId);
    return {
      transfer: row.rows[0],
      recipient: {
        id: recipient.id,
        display_id: recipient.display_id,
        first_name: recipient.first_name,
        last_name: recipient.last_name,
        recipient_type: 'coin_seller',
      },
      points,
      serviceFee,
      netPoints,
      coinsCredited,
      balance: bal,
      transfersRemainingToday: Math.max(0, dailyLimit - usedToday - 1),
    };
  } catch (e) {
    await db.safeRollback(client);
    if (/points_transfers|does not exist/i.test(e.message || '')) {
      throw new Error('Transfer tables are being set up. Please try again in a minute.');
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Normal-user exchange: points (stars) → spendable NR coin_balance.
 */
async function exchangePointsToCoins(userId, pointsAmount) {
  const settings = await getWalletSettings();
  const block = Number(settings.exchange_points_block) || 100000;
  const coinsPer10k = Number(settings.exchange_coins_per_10k_points) || 7000;
  const points = parseInt(pointsAmount, 10);
  if (!points || points < block || points % block !== 0) {
    throw new Error(`Amount must be a multiple of ${block.toLocaleString('en-US')} points`);
  }
  const coinsOut = Math.floor((points / 10000) * coinsPer10k);
  if (coinsOut <= 0) throw new Error('Exchange amount too small');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await debitStars(
      userId,
      points,
      {
        type: 'points_exchange',
        reference_type: 'points_exchange',
        metadata: { points, coinsOut, coinsPer10k },
      },
      client
    );
    const credited = await creditCoins(
      userId,
      coinsOut,
      {
        type: 'points_exchange',
        reference_type: 'points_exchange',
        metadata: { points, coinsOut, coinsPer10k },
      },
      client
    );
    await client.query('COMMIT');
    const bal = await getBalance(userId);
    return {
      points,
      coinsOut,
      rate: { block, coinsPer10k },
      balance: bal,
      coin_balance: credited.balance,
    };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Set absolute coin / point balances (admin platform-owner tool).
 * Uses credit/debit deltas so wallet_transactions stay consistent.
 */
async function setWalletBalances(userId, { coin_balance, star_balance } = {}, meta = {}) {
  const hasCoins = coin_balance !== undefined && coin_balance !== null && coin_balance !== '';
  const hasStars = star_balance !== undefined && star_balance !== null && star_balance !== '';
  if (!hasCoins && !hasStars) {
    throw new Error('Provide coin_balance and/or star_balance');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const wallet = await getOrCreateWallet(userId, client);
    let coins = Number(wallet.coin_balance);
    let stars = Number(wallet.star_balance);
    const baseMeta = {
      reference_type: meta.reference_type || 'admin_set_balance',
      reference_id: meta.reference_id || String(userId),
      metadata: {
        ...(meta.metadata || {}),
        actor_id: meta.actor_id || null,
      },
    };

    if (hasCoins) {
      const target = BigInt(Math.max(0, Math.floor(Number(coin_balance))));
      const current = BigInt(wallet.coin_balance);
      const delta = target - current;
      if (delta > 0n) {
        const r = await creditCoins(
          userId,
          delta.toString(),
          {
            ...baseMeta,
            type: 'admin_credit',
            metadata: { ...baseMeta.metadata, field: 'coin_balance', target: target.toString() },
          },
          client
        );
        coins = r.balance;
      } else if (delta < 0n) {
        const r = await debitCoins(
          userId,
          (-delta).toString(),
          {
            ...baseMeta,
            type: 'admin_debit',
            metadata: { ...baseMeta.metadata, field: 'coin_balance', target: target.toString() },
          },
          client
        );
        coins = r.balance;
      }
    }

    if (hasStars) {
      const target = BigInt(Math.max(0, Math.floor(Number(star_balance))));
      const fresh = await getOrCreateWallet(userId, client);
      const current = BigInt(fresh.star_balance);
      const delta = target - current;
      if (delta > 0n) {
        const r = await creditStars(
          userId,
          delta.toString(),
          {
            ...baseMeta,
            type: 'admin_credit',
            metadata: { ...baseMeta.metadata, field: 'star_balance', target: target.toString() },
          },
          client
        );
        stars = r.star_balance;
      } else if (delta < 0n) {
        const r = await debitStars(
          userId,
          (-delta).toString(),
          {
            ...baseMeta,
            type: 'admin_debit',
            metadata: { ...baseMeta.metadata, field: 'star_balance', target: target.toString() },
          },
          client
        );
        stars = r.star_balance;
      } else {
        stars = Number(current);
      }
    }

    await client.query('COMMIT');
    return { coin_balance: coins, star_balance: stars };
  } catch (e) {
    await db.safeRollback(client);
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
  exchangePointsToCoins,
  lookupPointsTransferRecipient,
  listPointsTransfers,
  countPointsTransfersToday,
  transferPointsToRecipient,
  computePointsTransferFee,
  resolvePointsTransferBlock,
  resolvePointsTransferFeePct,
  setWalletBalances,
  resolveMinWithdrawalCoins,
  resolveWithdrawalPointsPerUsd,
  resolveWithdrawalServiceFeePct,
  applyWithdrawalServiceFee,
  pointsToWithdrawalUsdGross,
  pointsToWithdrawalInrGross,
  pointsToWithdrawalUsd,
  pointsToWithdrawalInr,
  formatMinWithdrawalMessage,
};
