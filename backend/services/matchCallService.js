const crypto = require('crypto');
const db = require('../config/database');
const walletService = require('./walletService');
const matchQueueStore = require('./matchQueueStore');
const { uidFromUserId } = require('../lib/agoraUid');

function busyService() {
  return require('./userBusyService');
}

const VOICE_COST = Math.max(1, Number(process.env.MATCH_VOICE_COST || 50));
const VIDEO_COST = Math.max(1, Number(process.env.MATCH_VIDEO_COST || 100));
const SEARCH_TTL_MS = matchQueueStore.SEARCH_TTL_MS;
const CONNECT_GRACE_MS = 45_000;

const liveByUser = new Map();
const joinedFlags = new Map();
const billTimers = new Map();
let ioRef = null;

function setMatchIo(io) {
  ioRef = io;
}

function pricing() {
  return {
    voiceCost: VOICE_COST,
    videoCost: VIDEO_COST,
    billedPerMinute: true,
    currency: 'coins',
  };
}

function costFor(mode) {
  return mode === 'video' ? VIDEO_COST : VOICE_COST;
}

function sanitizeMode(raw) {
  return String(raw || '').toLowerCase() === 'video' ? 'video' : 'voice';
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function emitToUser(userId, event, payload) {
  if (!ioRef || !userId) return;
  ioRef.to(`user:${userId}`).emit(event, payload);
}

function channelFor(matchId) {
  return `m${String(matchId).replace(/-/g, '').slice(0, 31)}`;
}

async function loadPeer(userId) {
  const res = await db.query(
    `SELECT id, first_name, last_name, profile_pic, display_id, is_verified
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const u = res.rows[0];
  if (!u) return { id: userId, name: 'Match', pic: null };
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Match';
  return {
    id: String(u.id),
    name,
    pic: u.profile_pic || null,
    displayId: u.display_id || null,
    verified: Boolean(u.is_verified),
    agoraUid: uidFromUserId(u.id),
  };
}

async function spendableCoins(userId) {
  const bal = await walletService.getBalance(userId);
  return Number(bal.coin_balance || 0);
}

async function removeFromQueue(userId) {
  return matchQueueStore.remove(userId);
}

async function isUserInQueue(userId) {
  return matchQueueStore.isQueued(userId);
}

async function enqueueLocal(userId, mode, clientRequestId) {
  return matchQueueStore.enqueue(userId, mode, clientRequestId);
}

async function popAvailablePartner(mode, selfId) {
  const svc = busyService();
  let safety = 0;
  while (safety++ < 30) {
    const cand = await matchQueueStore.popOldest(mode, selfId);
    if (!cand) return null;
    const busy = await svc.getBusyState(cand.userId, { skipQueue: true }).catch(() => ({ busy: false }));
    if (busy.busy) {
      emitToUser(cand.userId, 'match:ended', {
        reason: 'busy',
        matchId: null,
        message: svc.busyMessage(busy),
      });
      continue;
    }
    return cand;
  }
  return null;
}

async function activeMatchFor(userId) {
  const res = await db.query(
    `SELECT * FROM match_calls
     WHERE (user_a = $1 OR user_b = $1)
       AND status IN ('matched', 'connecting', 'connected')
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function userInActiveMatchByChannel(userId, channel) {
  const res = await db.query(
    `SELECT id FROM match_calls
     WHERE channel = $1
       AND (user_a = $2 OR user_b = $2)
       AND status IN ('matched', 'connecting', 'connected')
     LIMIT 1`,
    [channel, userId]
  );
  return Boolean(res.rows[0]);
}

function isMatchChannel(channel) {
  return /^m[a-f0-9]/i.test(String(channel || ''));
}

function peerIdOf(row, userId) {
  return String(row.user_a) === String(userId) ? String(row.user_b) : String(row.user_a);
}

async function publicMatch(row, forUserId) {
  const peer = await loadPeer(peerIdOf(row, forUserId));
  return {
    matchId: row.id,
    channel: row.channel,
    mode: row.mode,
    status: row.status,
    audioOnly: row.mode === 'voice',
    cost: costFor(row.mode),
    minutesBilled: Number(row.minutes_billed || 0),
    peer,
  };
}

async function chargeMinute(matchId, userId, minuteIndex, mode) {
  const amount = costFor(mode);
  const key = `${matchId}:${userId}:${minuteIndex}`;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const dup = await client.query(
      `SELECT id FROM match_call_charges WHERE match_id = $1 AND user_id = $2 AND minute_index = $3`,
      [matchId, userId, minuteIndex]
    );
    if (dup.rows[0]) {
      await client.query('COMMIT');
      return { skipped: true, balance: await spendableCoins(userId) };
    }
    const debit = await walletService.debitCoins(
      userId,
      amount,
      {
        type: 'match_call',
        reference_type: 'match_call',
        reference_id: matchId,
        metadata: { mode, minuteIndex, idempotency: key },
      },
      client
    );
    await client.query(
      `INSERT INTO match_call_charges (match_id, user_id, minute_index, amount, wallet_tx_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [matchId, userId, minuteIndex, amount, debit.transaction?.id || null]
    );
    await client.query('COMMIT');
    return { skipped: false, balance: debit.balance, amount };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

async function endMatch(matchId, reason, byUserId) {
  const res = await db.query(`SELECT * FROM match_calls WHERE id = $1`, [matchId]);
  const row = res.rows[0];
  if (!row) return null;
  if (['ended', 'cancelled', 'failed'].includes(row.status)) return row;
  const t = billTimers.get(String(matchId));
  if (t) clearInterval(t);
  billTimers.delete(String(matchId));
  joinedFlags.delete(String(matchId));
  liveByUser.delete(String(row.user_a));
  liveByUser.delete(String(row.user_b));
  await db.query(
    `UPDATE match_calls SET status = $2, ended_at = CURRENT_TIMESTAMP, end_reason = $3
     WHERE id = $1 AND status IN ('matched', 'connecting', 'connected')`,
    [matchId, reason === 'cancelled' ? 'cancelled' : reason === 'failed' ? 'failed' : 'ended', String(reason || 'ended').slice(0, 48)]
  );
  const payload = {
    matchId,
    reason: reason || 'ended',
    byUserId: byUserId || null,
  };
  emitToUser(row.user_a, 'match:ended', payload);
  emitToUser(row.user_b, 'match:ended', payload);
  return row;
}

async function billTick(matchId) {
  const res = await db.query(`SELECT * FROM match_calls WHERE id = $1`, [matchId]);
  const row = res.rows[0];
  if (!row || row.status !== 'connected') {
    const t = billTimers.get(String(matchId));
    if (t) clearInterval(t);
    billTimers.delete(String(matchId));
    return;
  }
  const nextMinute = Number(row.minutes_billed || 0) + 1;
  if (nextMinute <= 1) return;
  for (const uid of [row.user_a, row.user_b]) {
    try {
      const result = await chargeMinute(row.id, uid, nextMinute, row.mode);
      if (!result.skipped) {
        emitToUser(uid, 'match:charge', {
          matchId: row.id,
          minute: nextMinute,
          amount: result.amount,
          balance: result.balance,
        });
      }
    } catch (err) {
      if (err.code === 'INSUFFICIENT_BALANCE') {
        emitToUser(uid, 'match:insufficient', {
          matchId: row.id,
          cost: costFor(row.mode),
          message: 'Not enough coins to continue the match',
        });
        await endMatch(row.id, 'insufficient_coins', uid);
        return;
      }
      throw err;
    }
  }
  await db.query(`UPDATE match_calls SET minutes_billed = $2 WHERE id = $1 AND minutes_billed < $2`, [
    row.id,
    nextMinute,
  ]);
}

function startBilling(matchId) {
  if (billTimers.has(String(matchId))) return;
  const t = setInterval(() => {
    billTick(matchId).catch(() => {});
  }, 60_000);
  billTimers.set(String(matchId), t);
}

async function createMatchedPair(a, b, mode) {
  const matchId = crypto.randomUUID();
  const channel = channelFor(matchId);
  const client = await db.pool.connect();
  let row;
  try {
    await client.query('BEGIN');
    const ids = [String(a), String(b)].sort();
    for (const id of ids) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('match_busy:' || $1))`, [id]);
    }

    const svc = busyService();
    const [busyA, busyB] = await Promise.all([
      svc.getBusyState(a, { skipQueue: true, client }),
      svc.getBusyState(b, { skipQueue: true, client }),
    ]);
    if (busyA.busy) {
      throw httpError(409, 'You became busy before the match could start', 'USER_BUSY', busyA);
    }
    if (busyB.busy) {
      throw httpError(409, 'Your match partner is no longer available', 'PARTNER_BUSY', busyB);
    }

    const dupA = await client.query(
      `SELECT id FROM match_calls
       WHERE (user_a = $1 OR user_b = $1) AND status IN ('matched', 'connecting', 'connected')
       LIMIT 1`,
      [a]
    );
    const dupB = await client.query(
      `SELECT id FROM match_calls
       WHERE (user_a = $1 OR user_b = $1) AND status IN ('matched', 'connecting', 'connected')
       LIMIT 1`,
      [b]
    );
    if (dupA.rows[0] || dupB.rows[0]) {
      throw httpError(409, 'A match is already active', 'MATCH_CONFLICT');
    }

    const inserted = await client.query(
      `INSERT INTO match_calls (id, mode, channel, user_a, user_b, status)
       VALUES ($1, $2, $3, $4, $5, 'matched')
       RETURNING *`,
      [matchId, mode, channel, a, b]
    );
    row = inserted.rows[0];
    await client.query('COMMIT');
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }

  liveByUser.set(String(a), matchId);
  liveByUser.set(String(b), matchId);
  joinedFlags.set(String(matchId), new Set());
  await removeFromQueue(a);
  await removeFromQueue(b);

  const [pubA, pubB] = await Promise.all([publicMatch(row, a), publicMatch(row, b)]);
  emitToUser(a, 'match:found', pubA);
  emitToUser(b, 'match:found', pubB);

  setTimeout(() => {
    db.query(`SELECT status FROM match_calls WHERE id = $1`, [matchId])
      .then((r) => {
        const st = r.rows[0]?.status;
        if (st === 'matched' || st === 'connecting') {
          return endMatch(matchId, 'connect_timeout');
        }
        return null;
      })
      .catch(() => {});
  }, CONNECT_GRACE_MS);

  return row;
}

async function enqueue(userId, modeRaw, clientRequestId) {
  const mode = sanitizeMode(modeRaw);
  const uid = String(userId);
  const cost = costFor(mode);
  const svc = busyService();

  let activeRow = null;
  const liveId = liveByUser.get(uid);
  if (liveId) {
    const liveRes = await db.query(`SELECT * FROM match_calls WHERE id = $1`, [liveId]);
    activeRow = liveRes.rows[0] || null;
  }
  if (!activeRow) activeRow = await activeMatchFor(uid);
  if (activeRow && !['ended', 'cancelled', 'failed'].includes(activeRow.status)) {
    return { status: activeRow.status, alreadyActive: true, ...(await publicMatch(activeRow, uid)) };
  }

  const queued = await matchQueueStore.getQueued(uid);
  if (queued && queued.mode === mode) {
    const coins = await spendableCoins(uid);
    return {
      status: 'searching',
      mode,
      cost,
      balance: coins,
      message: 'Looking for someone…',
    };
  }

  await removeFromQueue(uid);
  await svc.assertAvailableForMatch(uid);

  const coins = await spendableCoins(uid);
  if (coins < cost) {
    throw httpError(402, `You need ${cost} coins to start ${mode} match`, 'INSUFFICIENT_BALANCE');
  }

  const partner = await popAvailablePartner(mode, uid);
  if (!partner) {
    await enqueueLocal(uid, mode, clientRequestId);
    return {
      status: 'searching',
      mode,
      cost,
      balance: coins,
      message: 'Looking for someone…',
    };
  }

  const partnerCoins = await spendableCoins(partner.userId);
  if (partnerCoins < cost) {
    emitToUser(partner.userId, 'match:insufficient', {
      cost,
      message: 'Not enough coins to start the match',
    });
    await enqueueLocal(uid, mode, clientRequestId);
    return { status: 'searching', mode, cost, balance: coins, message: 'Looking for someone…' };
  }

  try {
    const row = await createMatchedPair(uid, partner.userId, mode);
    await removeFromQueue(partner.userId);
    return { status: 'matched', ...(await publicMatch(row, uid)), cost, balance: coins };
  } catch (err) {
    if (err.code === 'PARTNER_BUSY' || err.code === 'USER_BUSY' || err.code === 'MATCH_CONFLICT') {
      await enqueueLocal(uid, mode, clientRequestId);
      return { status: 'searching', mode, cost, balance: coins, message: 'Looking for someone…' };
    }
    throw err;
  }
}

async function evictUserFromMatch(userId, reason = 'busy') {
  const uid = String(userId);
  const wasQueued = await removeFromQueue(uid);
  if (wasQueued) {
    emitToUser(uid, 'match:ended', {
      reason: reason || 'busy',
      matchId: null,
      message: busyService().busyMessage({ busy: true, reason: 'busy_live' }) || 'Match search cancelled',
    });
  }

  const liveId = liveByUser.get(uid);
  if (liveId) {
    await endMatch(liveId, 'cancelled', uid);
    return { ok: true, status: 'cancelled', matchId: liveId };
  }
  const active = await activeMatchFor(uid);
  if (active) {
    await endMatch(active.id, 'cancelled', uid);
    return { ok: true, status: 'cancelled', matchId: active.id };
  }
  return { ok: true, status: wasQueued ? 'idle' : 'not_in_match' };
}

async function cancelSearch(userId) {
  const uid = String(userId);
  const liveId = liveByUser.get(uid);
  if (liveId) {
    await endMatch(liveId, 'cancelled', uid);
    return { ok: true, status: 'cancelled' };
  }
  const active = await activeMatchFor(uid);
  if (active) {
    await endMatch(active.id, 'cancelled', uid);
    return { ok: true, status: 'cancelled' };
  }
  await removeFromQueue(uid);
  return { ok: true, status: 'idle' };
}

async function markJoined(userId, matchId) {
  const uid = String(userId);
  const res = await db.query(`SELECT * FROM match_calls WHERE id = $1`, [matchId]);
  const row = res.rows[0];
  if (!row) throw httpError(404, 'Match not found', 'NOT_FOUND');
  if (![String(row.user_a), String(row.user_b)].includes(uid)) {
    throw httpError(403, 'Not in this match', 'FORBIDDEN');
  }
  if (['ended', 'cancelled', 'failed'].includes(row.status)) {
    throw httpError(409, 'Match already ended', 'ENDED');
  }

  const busy = await busyService().getBusyState(uid, { skipQueue: true });
  const { BUSY_CODES } = busyService();
  if (busy.busy && busy.reason !== BUSY_CODES.MATCH_ACTIVE) {
    await endMatch(matchId, 'cancelled', uid);
    throw httpError(409, busyService().busyMessage(busy), 'USER_BUSY', busy);
  }

  if (row.status === 'matched') {
    await db.query(`UPDATE match_calls SET status = 'connecting' WHERE id = $1 AND status = 'matched'`, [matchId]);
  }

  const set = joinedFlags.get(String(matchId)) || new Set();
  set.add(uid);
  joinedFlags.set(String(matchId), set);

  if (set.size < 2) {
    return { status: 'connecting', waitingPeer: true };
  }

  const cost = costFor(row.mode);
  for (const payUid of [row.user_a, row.user_b]) {
    try {
      const charged = await chargeMinute(row.id, payUid, 1, row.mode);
      if (!charged.skipped) {
        emitToUser(payUid, 'match:charge', {
          matchId: row.id,
          minute: 1,
          amount: charged.amount,
          balance: charged.balance,
        });
      }
    } catch (err) {
      if (err.code === 'INSUFFICIENT_BALANCE') {
        emitToUser(payUid, 'match:insufficient', {
          matchId: row.id,
          cost,
          message: 'Not enough coins to start the match',
        });
        await endMatch(row.id, 'insufficient_coins', payUid);
        throw httpError(402, 'Not enough coins to start the match', 'INSUFFICIENT_BALANCE');
      }
      throw err;
    }
  }

  await db.query(
    `UPDATE match_calls
     SET status = 'connected', connected_at = COALESCE(connected_at, CURRENT_TIMESTAMP), minutes_billed = GREATEST(minutes_billed, 1)
     WHERE id = $1`,
    [matchId]
  );
  startBilling(matchId);
  emitToUser(row.user_a, 'match:connected', { matchId: row.id });
  emitToUser(row.user_b, 'match:connected', { matchId: row.id });
  return { status: 'connected', cost };
}

async function hangup(userId, matchId) {
  const uid = String(userId);
  if (matchId) {
    const res = await db.query(`SELECT * FROM match_calls WHERE id = $1`, [matchId]);
    const row = res.rows[0];
    if (row && [String(row.user_a), String(row.user_b)].includes(uid)) {
      await endMatch(matchId, 'ended', uid);
      return { ok: true };
    }
  }
  return cancelSearch(uid);
}

async function sweepQueues() {
  const svc = busyService();
  await matchQueueStore.sweepExpired((userId, reason) => {
    emitToUser(userId, 'match:ended', { reason, matchId: null });
  });
  for (const mode of ['voice', 'video']) {
    const list = await matchQueueStore.listMode(mode);
    for (const rec of list) {
      try {
        const busy = await svc.getBusyState(rec.userId, { skipQueue: true });
        if (busy.busy) {
          await removeFromQueue(rec.userId);
          emitToUser(rec.userId, 'match:ended', {
            reason: 'busy',
            matchId: null,
            message: svc.busyMessage(busy),
          });
        }
      } catch (_e) {
        /* keep in queue if check fails */
      }
    }
  }
}

setInterval(() => {
  sweepQueues().catch(() => {});
}, 15_000).unref?.();

module.exports = {
  setMatchIo,
  pricing,
  costFor,
  enqueue,
  cancelSearch,
  evictUserFromMatch,
  markJoined,
  hangup,
  activeMatchFor,
  publicMatch,
  sanitizeMode,
  userInActiveMatchByChannel,
  isMatchChannel,
  isUserInQueue,
  removeFromQueue,
};
