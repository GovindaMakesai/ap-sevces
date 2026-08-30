const crypto = require('crypto');
const db = require('../config/database');
const walletService = require('./walletService');

const MAX_MULT = 1000;
const LUCKY_QTY = [1, 19, 49, 99, 299];

/**
 * Per-unit multiplier table. Cumulative weights / 100000.
 * Expected value ≈ 0.95 × unit (RTP ~95%), max 1000×.
 */
const UNIT_ROLLS = [
  { max: 94000, mult: 0 },
  { max: 99100, mult: 10 },
  { max: 99750, mult: 20 },
  { max: 99900, mult: 40 },
  { max: 99970, mult: 100 },
  { max: 99994, mult: 500 },
  { max: 100000, mult: 1000 },
];

function isLuckyCatalogGift(hit) {
  if (!hit) return false;
  if (hit.is_lucky === true || hit.is_lucky === 't' || hit.is_lucky === 1) return true;
  return String(hit.category || '').toLowerCase() === 'lucky';
}

function rollUnitMultiplier() {
  const r = crypto.randomInt(0, 100000);
  for (const row of UNIT_ROLLS) {
    if (r < row.max) return row.mult;
  }
  return 0;
}

function resolvePrize(unitCost, qty) {
  const unit = Math.max(1, Math.floor(Number(unitCost) || 0));
  const n = Math.max(1, Math.min(10000, Math.floor(Number(qty) || 1)));
  let prize = 0;
  let bestMult = 0;
  for (let i = 0; i < n; i += 1) {
    const mult = rollUnitMultiplier();
    if (mult > bestMult) bestMult = mult;
    prize += unit * mult;
  }
  return { prize, bestMult, unit, qty: n, cost: unit * n };
}

async function settleInTransaction({
  client,
  senderId,
  receiverId,
  liveRoomId,
  giftTxId,
  hit,
  qty,
  totalCost,
}) {
  if (!isLuckyCatalogGift(hit)) return null;
  const unit = Number(hit.coin_cost || 0);
  const settled = resolvePrize(unit, qty);
  const cost = Number(totalCost) || settled.cost;

  if (settled.prize > 0) {
    await walletService.creditCoins(
      senderId,
      settled.prize,
      {
        type: 'lucky_gift_prize',
        reference_type: 'lucky_gift',
        reference_id: giftTxId,
        metadata: {
          gift_tx_id: giftTxId,
          gift_slug: hit.slug,
          qty: settled.qty,
          cost,
          prize: settled.prize,
          best_mult: settled.bestMult,
        },
      },
      client
    );
  }

  const bal = await client.query(`SELECT coin_balance FROM wallets WHERE user_id = $1`, [senderId]);
  const senderBalance = Number(bal.rows[0]?.coin_balance || 0);

  await client.query(
    `INSERT INTO lucky_gift_plays
       (gift_tx_id, sender_id, receiver_id, live_room_id, gift_slug, gift_name, emoji, qty, unit_cost, cost, prize, max_mult)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (gift_tx_id) DO NOTHING`,
    [
      giftTxId,
      senderId,
      receiverId,
      liveRoomId || null,
      String(hit.slug || 'lucky').slice(0, 64),
      String(hit.name || 'Lucky Gift').slice(0, 64),
      hit.emoji || '🍀',
      settled.qty,
      settled.unit,
      cost,
      settled.prize,
      MAX_MULT,
    ]
  );

  return {
    lucky: true,
    qty: settled.qty,
    unit_cost: settled.unit,
    cost,
    prize: settled.prize,
    best_mult: settled.bestMult,
    max_mult: MAX_MULT,
    gift_slug: hit.slug,
    gift_name: hit.name,
    emoji: hit.emoji || '🍀',
    sender_balance: senderBalance,
  };
}

async function listHistory(userId, { limit = 40, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 40, 1), 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const res = await db.query(
    `SELECT id, gift_slug, gift_name, emoji, qty, unit_cost, cost, prize, max_mult, created_at
     FROM lucky_gift_plays
     WHERE sender_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, off]
  );
  return res.rows;
}

async function listRank({ limit = 50 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const res = await db.query(
    `SELECT u.id AS user_id,
            TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS name,
            u.profile_pic,
            COALESCE(SUM(p.prize), 0)::bigint AS win,
            GREATEST(1, LEAST(99, (LN(GREATEST(COALESCE(SUM(p.prize), 0), 1) + 10) * 6)::int)) AS level
     FROM lucky_gift_plays p
     JOIN users u ON u.id = p.sender_id
     WHERE p.prize > 0
     GROUP BY u.id, u.first_name, u.last_name, u.profile_pic
     HAVING COALESCE(SUM(p.prize), 0) > 0
     ORDER BY win DESC, name ASC
     LIMIT $1`,
    [lim]
  );
  return res.rows.map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    name: row.name || 'User',
    profilePic: row.profile_pic,
    win: Number(row.win || 0),
    level: Number(row.level || 1),
  }));
}

function decorateCatalogRow(row) {
  const lucky = isLuckyCatalogGift(row);
  return {
    ...row,
    is_lucky: lucky,
    lucky_quantities: lucky ? LUCKY_QTY : undefined,
    lucky_max_mult: lucky ? MAX_MULT : undefined,
  };
}

module.exports = {
  MAX_MULT,
  LUCKY_QTY,
  isLuckyCatalogGift,
  resolvePrize,
  settleInTransaction,
  listHistory,
  listRank,
  decorateCatalogRow,
};
