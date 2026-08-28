/**
 * Authoritative user availability for Voice/Video Match.
 * Uses DB state (live rooms, PK, active match calls) — not client UI state.
 */
const db = require('../config/database');
const { isMatchCallEnabled, isMissingRelationError } = require('../lib/matchCallFeature');

const BUSY_CODES = {
  MATCH_ACTIVE: 'match_active',
  MATCH_QUEUE: 'match_queue',
  LIVE_HOST: 'live_host',
  LIVE_VIEWER: 'live_viewer',
  PARTY_ROOM: 'party_room',
  PARTY_SEAT: 'party_seat',
  PK_BATTLE: 'pk_battle',
};

function busyMessage(state) {
  if (!state?.busy) return null;
  switch (state.reason) {
    case BUSY_CODES.MATCH_ACTIVE:
      return 'You are already in a match call';
    case BUSY_CODES.MATCH_QUEUE:
      return 'You are already searching for a match';
    case BUSY_CODES.LIVE_HOST:
      return 'You are hosting a live — end it before starting a match';
    case BUSY_CODES.LIVE_VIEWER:
      return 'Leave the live room before starting a match';
    case BUSY_CODES.PARTY_ROOM:
      return 'Leave the party room before starting a match';
    case BUSY_CODES.PARTY_SEAT:
      return 'Leave your party seat before starting a match';
    case BUSY_CODES.PK_BATTLE:
      return 'You are in a PK battle — finish it before starting a match';
    default:
      return 'You are busy and cannot start a match right now';
  }
}

function httpError(status, message, code, data = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.data = data;
  return err;
}

async function queryLivePresence(userId, client = db) {
  const res = await client.query(
    `SELECT m.role, m.seat_index, r.channel, r.room_type, r.pk_status, r.host_user_id
     FROM live_room_members m
     JOIN live_rooms r ON r.id = m.live_room_id
     WHERE m.user_id = $1 AND m.left_at IS NULL AND r.status = 'active'
     ORDER BY m.joined_at DESC
     LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function queryActivePk(userId, client = db) {
  const participant = await client.query(
    `SELECT b.id, b.channel, b.status
     FROM pk_participants pp
     JOIN pk_battles b ON b.id = pp.battle_id
     WHERE pp.user_id = $1 AND b.status IN ('pending', 'active')
     ORDER BY b.created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (participant.rows[0]) return participant.rows[0];

  const hostPk = await client.query(
    `SELECT b.id, b.channel, b.status
     FROM live_rooms r
     JOIN pk_battles b ON b.channel = r.channel AND b.status IN ('pending', 'active')
     WHERE r.host_user_id = $1 AND r.status = 'active'
     ORDER BY b.created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (hostPk.rows[0]) return hostPk.rows[0];

  const linkedPk = await client.query(
    `SELECT b.id, b.channel, b.status
     FROM live_room_members m
     JOIN live_rooms r ON r.id = m.live_room_id
     JOIN pk_battles b ON b.status IN ('pending', 'active')
       AND (b.channel = r.channel OR r.pk_status IN ('pending', 'active'))
     WHERE m.user_id = $1 AND m.left_at IS NULL AND r.status = 'active'
     ORDER BY b.created_at DESC
     LIMIT 1`,
    [userId]
  );
  return linkedPk.rows[0] || null;
}

async function queryActiveMatch(userId, client = db) {
  if (!isMatchCallEnabled()) return null;
  try {
    const res = await client.query(
      `SELECT id, channel, mode, status
       FROM match_calls
       WHERE (user_a = $1 OR user_b = $1)
         AND status IN ('matched', 'connecting', 'connected')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}

function livePresenceToBusy(live, userId) {
  if (!live) return null;
  const uid = String(userId);
  const isHost = String(live.host_user_id) === uid || live.role === 'host';
  const onSeat =
    live.seat_index != null || ['speaker', 'admin'].includes(String(live.role || '').toLowerCase());

  if (isHost) {
    return {
      busy: true,
      reason: BUSY_CODES.LIVE_HOST,
      channel: live.channel,
      roomType: live.room_type,
    };
  }
  if (onSeat) {
    return {
      busy: true,
      reason: BUSY_CODES.PARTY_SEAT,
      channel: live.channel,
      roomType: live.room_type,
    };
  }
  if (live.room_type === 'party') {
    return {
      busy: true,
      reason: BUSY_CODES.PARTY_ROOM,
      channel: live.channel,
      roomType: live.room_type,
    };
  }
  return {
    busy: true,
    reason: BUSY_CODES.LIVE_VIEWER,
    channel: live.channel,
    roomType: live.room_type,
  };
}

/**
 * @param {string} userId
 * @param {{ skipQueue?: boolean, client?: object }} opts
 */
async function getBusyState(userId, opts = {}) {
  const uid = String(userId || '');
  if (!uid) return { busy: false };

  const client = opts.client || db;

  const match = await queryActiveMatch(uid, client);
  if (match) {
    return {
      busy: true,
      reason: BUSY_CODES.MATCH_ACTIVE,
      matchId: match.id,
      channel: match.channel,
      mode: match.mode,
      status: match.status,
    };
  }

  const live = await queryLivePresence(uid, client);
  const liveBusy = livePresenceToBusy(live, uid);
  if (liveBusy) return liveBusy;

  const pk = await queryActivePk(uid, client);
  if (pk) {
    return {
      busy: true,
      reason: BUSY_CODES.PK_BATTLE,
      channel: pk.channel,
      pkBattleId: pk.id,
      pkStatus: pk.status,
    };
  }

  if (!opts.skipQueue && isMatchCallEnabled()) {
    try {
      const matchCallService = require('./matchCallService');
      if (await matchCallService.isUserInQueue(uid)) {
        return { busy: true, reason: BUSY_CODES.MATCH_QUEUE };
      }
    } catch (_e) {
      /* ignore — match feature optional */
    }
  }

  return { busy: false };
}

async function assertAvailableForMatch(userId, opts = {}) {
  const state = await getBusyState(userId, opts);
  if (!state.busy) return state;
  if (state.reason === BUSY_CODES.MATCH_QUEUE && opts.allowQueue) return state;
  throw httpError(409, busyMessage(state), 'USER_BUSY', state);
}

async function isAvailableForMatch(userId) {
  const state = await getBusyState(userId);
  return !state.busy;
}

/** Called when user enters a live/party room or takes a seat — evict from match queue/call. */
async function onUserEnteredLive(userId) {
  if (!isMatchCallEnabled()) return;
  try {
    const matchCallService = require('./matchCallService');
    await matchCallService.evictUserFromMatch(userId, 'busy_live');
  } catch (err) {
    console.warn('[userBusy] onUserEnteredLive', err.message);
  }
}

/** Called after leaveRoom — mostly informational; DB is authoritative on next check. */
async function onUserLeftLive(_userId) {
  return { ok: true };
}

/** Block live join while in an active match call (RN match only — skipped when disabled). */
async function assertCanJoinLive(userId) {
  if (!isMatchCallEnabled()) return true;
  try {
    const state = await getBusyState(userId, { skipQueue: true });
    if (state.busy && state.reason === BUSY_CODES.MATCH_ACTIVE) {
      throw httpError(
        409,
        'End your match call before joining a live room',
        'IN_MATCH_CALL',
        state
      );
    }
  } catch (err) {
    if (isMissingRelationError(err)) return true;
    throw err;
  }
  return true;
}

module.exports = {
  BUSY_CODES,
  busyMessage,
  getBusyState,
  assertAvailableForMatch,
  isAvailableForMatch,
  onUserEnteredLive,
  onUserLeftLive,
  assertCanJoinLive,
  queryLivePresence,
  queryActiveMatch,
  queryActivePk,
};
