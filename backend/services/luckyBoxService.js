const crypto = require('crypto');
const db = require('../config/database');
const walletService = require('./walletService');
const followService = require('./followService');

const UNIT_OPTIONS = [10, 50, 100, 500, 1000];
const COUNT_OPTIONS = [5, 10, 50, 100, 200];
const DURATION_OPTIONS = [60, 180, 300, 600];
const GRAB_CLAIM_WINDOW_MS = 30 * 60 * 1000;

const timers = new Map();

function normalizeRequestId(raw) {
  const id = String(raw || '').trim().slice(0, 80);
  if (!id || id.length < 8) return '';
  return id.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 80);
}

function splitLuckyPrizes(total, winners) {
  const n = Math.max(1, Math.min(200, Math.floor(Number(winners) || 1)));
  const pool = Math.max(n, Math.floor(Number(total) || 0));
  const weights = Array.from({ length: n }, () => crypto.randomInt(1, 10001));
  const sum = weights.reduce((a, b) => a + b, 0);
  const prizes = weights.map((w) => Math.max(1, Math.floor((pool * w) / sum)));
  let used = prizes.reduce((a, b) => a + b, 0);
  let i = 0;
  while (used < pool) {
    prizes[i % n] += 1;
    used += 1;
    i += 1;
  }
  while (used > pool && prizes.some((p) => p > 1)) {
    const idx = prizes.findIndex((p) => p > 1);
    if (idx < 0) break;
    prizes[idx] -= 1;
    used -= 1;
  }
  return prizes;
}

function evenPrizes(unit, winners) {
  const n = Math.max(1, Math.min(200, Math.floor(Number(winners) || 1)));
  const u = Math.max(1, Math.floor(Number(unit) || 1));
  return Array.from({ length: n }, () => u);
}

function publicBox(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    channel: row.channel,
    senderId: row.sender_id,
    senderName: row.sender_name || 'User',
    senderPic: row.sender_pic || null,
    hostUserId: row.host_user_id,
    mode: row.mode,
    claimMethod: row.claim_method,
    participate: row.participate,
    unitCoins: Number(row.unit_coins),
    winnerCount: Number(row.winner_count),
    totalCost: Number(row.total_cost),
    remainingCount: Number(row.remaining_count),
    remainingCoins: Number(row.remaining_coins),
    durationSec: Number(row.duration_sec),
    opensAt: row.opens_at,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
    ...extras,
  };
}

async function eligible(userId, box) {
  if (!userId || String(userId) === String(box.sender_id)) return false;
  if (box.participate === 'all') return true;
  if (box.participate === 'follow' || box.participate === 'fanclub') {
    if (!box.host_user_id) return true;
    return followService.isFollowing(userId, box.host_user_id);
  }
  return true;
}

async function roomMemberIds(liveRoomId, channel) {
  if (liveRoomId) {
    const res = await db.query(
      `SELECT user_id FROM live_room_members
       WHERE live_room_id = $1 AND left_at IS NULL`,
      [liveRoomId]
    );
    return res.rows.map((r) => String(r.user_id));
  }
  const res = await db.query(
    `SELECT m.user_id
     FROM live_room_members m
     JOIN live_rooms r ON r.id = m.live_room_id
     WHERE r.channel = $1 AND m.left_at IS NULL`,
    [channel]
  );
  return res.rows.map((r) => String(r.user_id));
}

async function loadBox(id, client) {
  const q = client || db;
  const res = await q.query(`SELECT * FROM lucky_boxes WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function refundRemainder(client, box) {
  const leftover = Number(box.remaining_coins || 0);
  if (leftover > 0) {
    await walletService.creditCoins(
      box.sender_id,
      leftover,
      {
        type: 'lucky_box_refund',
        reference_type: 'lucky_box',
        reference_id: box.id,
        metadata: { box_id: box.id, leftover },
      },
      client
    );
  }
  await client.query(
    `UPDATE lucky_boxes
     SET remaining_coins = 0, remaining_count = 0, prizes = '[]'::jsonb, status = 'refunded'
     WHERE id = $1`,
    [box.id]
  );
}

async function settleRandomDraw(boxId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const boxRes = await client.query(`SELECT * FROM lucky_boxes WHERE id = $1 FOR UPDATE`, [boxId]);
    const box = boxRes.rows[0];
    if (!box || box.status === 'settled' || box.status === 'refunded') {
      await client.query('COMMIT');
      return { box: publicBox(box), winners: [] };
    }
    if (box.claim_method !== 'random') {
      await client.query(
        `UPDATE lucky_boxes SET status = 'open' WHERE id = $1 AND status = 'countdown'`,
        [boxId]
      );
      await client.query('COMMIT');
      return { box: publicBox({ ...box, status: 'open' }), winners: [] };
    }

    const prizes = Array.isArray(box.prizes) ? box.prizes.map((n) => Number(n)) : [];
    const members = (await roomMemberIds(box.live_room_id, box.channel)).filter(
      (id) => id && id !== String(box.sender_id)
    );
    const pool = [];
    for (const uid of members) {
      if (await eligible(uid, box)) pool.push(uid);
    }
    crypto.randomBytes(8);
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(0, i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const take = pool.slice(0, Math.min(prizes.length, pool.length));
    const winners = [];
    let paid = 0;
    for (let i = 0; i < take.length; i += 1) {
      const prize = Math.max(0, Number(prizes[i] || 0));
      if (prize <= 0) continue;
      await walletService.creditCoins(
        take[i],
        prize,
        {
          type: 'lucky_box_win',
          reference_type: 'lucky_box',
          reference_id: box.id,
          metadata: { box_id: box.id, prize, method: 'random' },
        },
        client
      );
      await client.query(
        `INSERT INTO lucky_box_claims (box_id, user_id, prize) VALUES ($1, $2, $3)
         ON CONFLICT (box_id, user_id) DO NOTHING`,
        [box.id, take[i], prize]
      );
      winners.push({ userId: take[i], prize });
      paid += prize;
    }
    const leftover = Math.max(0, Number(box.total_cost) - paid);
    if (leftover > 0) {
      await walletService.creditCoins(
        box.sender_id,
        leftover,
        {
          type: 'lucky_box_refund',
          reference_type: 'lucky_box',
          reference_id: box.id,
          metadata: { box_id: box.id, leftover, reason: 'random_undersubscribed' },
        },
        client
      );
    }
    await client.query(
      `UPDATE lucky_boxes
       SET remaining_count = 0, remaining_coins = 0, prizes = '[]'::jsonb, status = 'settled'
       WHERE id = $1`,
      [box.id]
    );
    await client.query('COMMIT');
    return { box: publicBox({ ...box, status: 'settled', remaining_count: 0, remaining_coins: 0 }), winners };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

function scheduleBox(box, emitFn) {
  if (!box?.id) return;
  const existing = timers.get(String(box.id));
  if (existing) clearTimeout(existing);
  const opens = new Date(box.opensAt || box.opens_at).getTime();
  const wait = Math.max(250, opens - Date.now());
  const t = setTimeout(() => {
    timers.delete(String(box.id));
    (async () => {
      try {
        if (box.claimMethod === 'random' || box.claim_method === 'random') {
          const settled = await settleRandomDraw(box.id);
          emitFn?.('live:lucky_box_result', {
            ...settled.box,
            winners: settled.winners,
          });
        } else {
          await db.query(
            `UPDATE lucky_boxes SET status = 'open' WHERE id = $1 AND status = 'countdown'`,
            [box.id]
          );
          emitFn?.('live:lucky_box_update', { id: box.id, status: 'open' });
          const expireWait = Math.max(1000, new Date(box.expiresAt || box.expires_at).getTime() - Date.now());
          const t2 = setTimeout(() => {
            timers.delete(`${box.id}:exp`);
            expireGrab(box.id, emitFn).catch(() => {});
          }, expireWait);
          timers.set(`${box.id}:exp`, t2);
        }
      } catch (err) {
        console.warn('[lucky-box] timer', err.message);
      }
    })();
  }, Math.min(wait, 24 * 60 * 60 * 1000));
  timers.set(String(box.id), t);
}

async function expireGrab(boxId, emitFn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const boxRes = await client.query(`SELECT * FROM lucky_boxes WHERE id = $1 FOR UPDATE`, [boxId]);
    const box = boxRes.rows[0];
    if (!box || box.status === 'settled' || box.status === 'refunded') {
      await client.query('COMMIT');
      return;
    }
    if (new Date(box.expires_at).getTime() > Date.now() + 500) {
      await client.query('COMMIT');
      return;
    }
    await refundRemainder(client, box);
    await client.query('COMMIT');
    emitFn?.('live:lucky_box_update', { id: boxId, status: 'refunded' });
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

async function createBox({
  senderId,
  liveRoomId,
  channel,
  hostUserId,
  mode,
  claimMethod,
  participate,
  unitCoins,
  winnerCount,
  durationSec,
  senderName,
  senderPic,
  clientRequestId,
}) {
  const requestId = normalizeRequestId(clientRequestId);
  const unit = UNIT_OPTIONS.includes(Number(unitCoins))
    ? Number(unitCoins)
    : Math.max(10, Math.min(1000, Math.floor(Number(unitCoins) || 10)));
  let count = Math.floor(Number(winnerCount) || 5);
  if (!COUNT_OPTIONS.includes(count)) count = Math.max(1, Math.min(200, count));
  const dur = DURATION_OPTIONS.includes(Number(durationSec)) ? Number(durationSec) : 180;
  const kind = String(mode || 'even').toLowerCase() === 'lucky' ? 'lucky' : 'even';
  const method = String(claimMethod || 'grab').toLowerCase() === 'random' ? 'random' : 'grab';
  const who = ['all', 'follow', 'fanclub'].includes(String(participate)) ? String(participate) : 'all';
  const prizes = kind === 'lucky' ? splitLuckyPrizes(unit * count, count) : evenPrizes(unit, count);
  const total = prizes.reduce((a, b) => a + b, 0);
  const opensAt = new Date(Date.now() + dur * 1000);
  const expiresAt = method === 'grab' ? new Date(opensAt.getTime() + GRAB_CLAIM_WINDOW_MS) : opensAt;

  if (requestId) {
    const existing = await db.query(
      `SELECT * FROM lucky_boxes WHERE sender_id = $1 AND client_request_id = $2 LIMIT 1`,
      [senderId, requestId]
    );
    if (existing.rows[0]) return publicBox(existing.rows[0], { replayed: true });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await walletService.debitCoins(
      senderId,
      total,
      {
        type: 'lucky_box_send',
        reference_type: 'lucky_box',
        metadata: { mode: kind, claim_method: method, winner_count: count, unit_coins: unit },
      },
      client
    );
    const ins = await client.query(
      `INSERT INTO lucky_boxes
         (client_request_id, sender_id, live_room_id, channel, host_user_id, mode, claim_method,
          participate, unit_coins, winner_count, total_cost, remaining_count, remaining_coins,
          prizes, duration_sec, opens_at, expires_at, status, sender_name, sender_pic)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,'countdown',$18,$19)
       RETURNING *`,
      [
        requestId || null,
        senderId,
        liveRoomId || null,
        String(channel).slice(0, 64),
        hostUserId || null,
        kind,
        method,
        who,
        unit,
        count,
        total,
        count,
        total,
        JSON.stringify(prizes),
        dur,
        opensAt,
        expiresAt,
        String(senderName || 'User').slice(0, 64),
        senderPic || null,
      ]
    );
    await client.query('COMMIT');
    return publicBox(ins.rows[0]);
  } catch (e) {
    await db.safeRollback(client);
    if (e.code === '23505' && requestId) {
      const existing = await db.query(
        `SELECT * FROM lucky_boxes WHERE sender_id = $1 AND client_request_id = $2 LIMIT 1`,
        [senderId, requestId]
      );
      if (existing.rows[0]) return publicBox(existing.rows[0], { replayed: true });
    }
    throw e;
  } finally {
    client.release();
  }
}

async function claimGrab({ boxId, userId, displayName }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const boxRes = await client.query(`SELECT * FROM lucky_boxes WHERE id = $1 FOR UPDATE`, [boxId]);
    const box = boxRes.rows[0];
    if (!box) throw new Error('Lucky box not found');
    if (box.claim_method !== 'grab') throw new Error('This box is a random draw');
    if (box.status === 'countdown') throw new Error('Wait for the countdown');
    if (box.status !== 'open') throw new Error('This box is closed');
    if (new Date(box.expires_at).getTime() < Date.now()) {
      await refundRemainder(client, box);
      await client.query('COMMIT');
      const err = new Error('Lucky box expired — coins returned to sender');
      err.code = 'EXPIRED';
      throw err;
    }
    if (String(userId) === String(box.sender_id)) throw new Error('You cannot claim your own box');
    const already = await client.query(
      `SELECT prize FROM lucky_box_claims WHERE box_id = $1 AND user_id = $2`,
      [boxId, userId]
    );
    if (already.rows[0]) {
      await client.query('COMMIT');
      return { prize: Number(already.rows[0].prize), replayed: true, box: publicBox(box) };
    }
    if (!(await eligible(userId, box))) {
      throw new Error(box.participate === 'fanclub' ? 'Join the fan club to claim' : 'Follow the host to claim');
    }
    const prizes = Array.isArray(box.prizes) ? box.prizes.map((n) => Number(n)) : [];
    if (!prizes.length || Number(box.remaining_count) <= 0) throw new Error('All rewards have been grabbed');
    const prize = Math.max(0, Number(prizes.shift() || 0));
    if (prize <= 0) throw new Error('All rewards have been grabbed');
    await walletService.creditCoins(
      userId,
      prize,
      {
        type: 'lucky_box_win',
        reference_type: 'lucky_box',
        reference_id: box.id,
        metadata: { box_id: box.id, prize, method: 'grab' },
      },
      client
    );
    await client.query(`INSERT INTO lucky_box_claims (box_id, user_id, prize) VALUES ($1,$2,$3)`, [
      boxId,
      userId,
      prize,
    ]);
    const remainingCount = prizes.length;
    const remainingCoins = prizes.reduce((a, b) => a + b, 0);
    const status = remainingCount <= 0 ? 'settled' : 'open';
    await client.query(
      `UPDATE lucky_boxes
       SET prizes = $2::jsonb, remaining_count = $3, remaining_coins = $4, status = $5
       WHERE id = $1`,
      [boxId, JSON.stringify(prizes), remainingCount, remainingCoins, status]
    );
    await client.query('COMMIT');
    return {
      prize,
      displayName: displayName || 'User',
      box: publicBox({
        ...box,
        prizes,
        remaining_count: remainingCount,
        remaining_coins: remainingCoins,
        status,
      }),
    };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

async function listActive(channel) {
  const res = await db.query(
    `SELECT * FROM lucky_boxes
     WHERE channel = $1 AND status IN ('countdown', 'open')
     ORDER BY created_at DESC
     LIMIT 8`,
    [String(channel || '').slice(0, 64)]
  );
  return res.rows.map((r) => publicBox(r));
}

async function listHistory(userId, { limit = 40 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 40, 1), 80);
  const res = await db.query(
    `SELECT c.prize, c.created_at, b.mode, b.claim_method, b.sender_name, b.unit_coins, b.total_cost
     FROM lucky_box_claims c
     JOIN lucky_boxes b ON b.id = c.box_id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC
     LIMIT $2`,
    [userId, lim]
  );
  return res.rows;
}

async function listWinners(boxId) {
  const res = await db.query(
    `SELECT c.user_id, c.prize, c.created_at,
            TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) AS name,
            u.profile_pic
     FROM lucky_box_claims c
     JOIN users u ON u.id = c.user_id
     WHERE c.box_id = $1
     ORDER BY c.prize DESC, c.created_at ASC`,
    [boxId]
  );
  return res.rows.map((r) => ({
    userId: r.user_id,
    name: r.name || 'User',
    profilePic: r.profile_pic,
    prize: Number(r.prize),
  }));
}

async function resumeTimers(emitByChannel) {
  const res = await db.query(
    `SELECT * FROM lucky_boxes WHERE status IN ('countdown', 'open') ORDER BY created_at DESC LIMIT 80`
  );
  for (const box of res.rows) {
    const emitFn = (event, payload) => emitByChannel?.(box.channel, event, payload);
    if (box.status === 'countdown') scheduleBox(box, emitFn);
    else if (box.claim_method === 'grab') {
      const expireWait = Math.max(500, new Date(box.expires_at).getTime() - Date.now());
      const t2 = setTimeout(() => expireGrab(box.id, emitFn).catch(() => {}), expireWait);
      timers.set(`${box.id}:exp`, t2);
    }
  }
}

module.exports = {
  UNIT_OPTIONS,
  COUNT_OPTIONS,
  DURATION_OPTIONS,
  createBox,
  claimGrab,
  settleRandomDraw,
  listActive,
  listHistory,
  listWinners,
  scheduleBox,
  resumeTimers,
  loadBox,
  publicBox,
};
