const db = require('../config/database');
const crypto = require('crypto');
const { uidFromUserId } = require('../lib/agoraUid');
const {
  accumulateHostHeartbeat,
  recordSessionEnd,
  HEARTBEAT_SECONDS,
} = require('./liveHostStatsService');
const {
  accumulateMemberWatchTime,
  recordRoomJoin,
  flushMemberSessionStats,
} = require('./liveUserAnalyticsService');

/** In-memory hot cache — DB is source of truth. */
const roomCache = new Map();
const ROOM_CACHE_TTL_MS = 5000;

function cacheRoom(channel, row) {
  if (channel && row) roomCache.set(channel, { row, at: Date.now() });
}

function getCachedRoom(channel) {
  const hit = roomCache.get(channel);
  if (!hit) return null;
  if (Date.now() - hit.at > ROOM_CACHE_TTL_MS) {
    roomCache.delete(channel);
    return null;
  }
  return hit.row;
}

function invalidateRoomCache(channel) {
  if (channel) roomCache.delete(channel);
}

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return {};
  }
}

async function findByChannel(channel) {
  const cached = getCachedRoom(channel);
  if (cached) return cached;
  const res = await db.query(`SELECT * FROM live_rooms WHERE channel = $1 LIMIT 1`, [channel]);
  const row = res.rows[0] || null;
  if (row) cacheRoom(channel, row);
  return row;
}

async function findById(id) {
  const res = await db.query(`SELECT * FROM live_rooms WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function hostRoom({ channel, roomType, hostUserId, hostDisplayName }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let room = await client.query(`SELECT * FROM live_rooms WHERE channel = $1 FOR UPDATE`, [channel]);
    if (room.rows.length) {
      await client.query(
        `UPDATE live_rooms SET host_user_id = $1, host_display_name = $2, room_type = $3, status = 'active',
         ended_at = NULL, broadcast_seconds = 0, peak_viewer_count = 0, started_at = CURRENT_TIMESTAMP,
         viewer_count = GREATEST(viewer_count, 1), updated_at = CURRENT_TIMESTAMP WHERE channel = $4`,
        [hostUserId, hostDisplayName, roomType, channel]
      );
      room = await client.query(`SELECT * FROM live_rooms WHERE channel = $1`, [channel]);
    } else {
      room = await client.query(
        `INSERT INTO live_rooms (channel, room_type, host_user_id, host_display_name, status, viewer_count)
         VALUES ($1, $2, $3, $4, 'active', 1) RETURNING *`,
        [channel, roomType, hostUserId, hostDisplayName]
      );
    }
    const liveRoom = room.rows[0];

    await client.query(
      `INSERT INTO live_room_members (live_room_id, user_id, display_name, role, left_at, last_seen_at)
       VALUES ($1, $2, $3, 'host', NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (live_room_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, role = 'host', left_at = NULL, joined_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP, active_seconds = 0`,
      [liveRoom.id, hostUserId, hostDisplayName]
    );

    await client.query(
      `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload)
       VALUES ($1, $2, 'room_started', $3)`,
      [liveRoom.id, hostUserId, JSON.stringify({ channel, room_type: roomType })]
    );

    await client.query('COMMIT');
    cacheRoom(channel, liveRoom);
    return liveRoom;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function joinRoom({ channel, userId, displayName, asHost = false }) {
  let room = await findByChannel(channel);
  if (!room) {
    if (!asHost) throw new Error('Room does not exist');
    return hostRoom({ channel, roomType: 'party', hostUserId: userId, hostDisplayName: displayName });
  }
  if (room.status === 'ended' && !asHost) {
    throw new Error('This live has ended');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const prevMember = await client.query(
      `SELECT left_at FROM live_room_members WHERE live_room_id = $1 AND user_id = $2 FOR UPDATE`,
      [room.id, userId]
    );
    const wasAlreadyInRoom =
      prevMember.rows.length > 0 && prevMember.rows[0].left_at == null;

    await client.query(
      `INSERT INTO live_room_members (live_room_id, user_id, display_name, role, left_at, last_seen_at, seat_index)
       VALUES ($1, $2, $3, $4, NULL, CURRENT_TIMESTAMP, $5)
       ON CONFLICT (live_room_id, user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         left_at = NULL,
         joined_at = CURRENT_TIMESTAMP,
         last_seen_at = CURRENT_TIMESTAMP,
         active_seconds = 0`,
      [room.id, userId, displayName, asHost ? 'host' : 'viewer', asHost ? 1 : null]
    );

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS c FROM live_room_members WHERE live_room_id = $1 AND left_at IS NULL`,
      [room.id]
    );
    const viewers = countRes.rows[0].c;
    await client.query(
      `UPDATE live_rooms SET viewer_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [viewers, room.id]
    );

    if (!wasAlreadyInRoom) {
      await client.query(
        `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'join', $3)`,
        [room.id, userId, JSON.stringify({ display_name: displayName })]
      );
      try {
        await recordRoomJoin(userId, room.room_type);
      } catch (_e) {}
    }

    room = (await client.query(`SELECT * FROM live_rooms WHERE id = $1`, [room.id])).rows[0];
    await client.query('COMMIT');
    cacheRoom(channel, room);
    return room;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function leaveRoom({ channel, userId }) {
  const room = await findByChannel(channel);
  if (!room) return null;

  try {
    await flushMemberSessionStats(room, userId);
  } catch (_e) {}

  await db.query(
    `UPDATE live_room_members SET left_at = CURRENT_TIMESTAMP WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [room.id, userId]
  );

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM live_room_members WHERE live_room_id = $1 AND left_at IS NULL`,
    [room.id]
  );
  const viewers = countRes.rows[0].c;
  await db.query(`UPDATE live_rooms SET viewer_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [
    viewers,
    room.id,
  ]);

  const memberRow = await db.query(
    `SELECT display_name FROM live_room_members WHERE live_room_id = $1 AND user_id = $2 LIMIT 1`,
    [room.id, userId]
  );
  const leaveName = memberRow.rows[0]?.display_name || 'Someone';
  await db.query(
    `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'leave', $3)`,
    [room.id, userId, JSON.stringify({ display_name: leaveName })]
  );

  return { ...room, viewer_count: viewers };
}

async function getActiveMembers(liveRoomId) {
  const res = await db.query(
    `SELECT m.user_id, m.display_name, m.role, m.is_muted, m.gift_count, m.joined_at, m.seat_index,
            m.last_seen_at, u.profile_pic
     FROM live_room_members m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.live_room_id = $1 AND m.left_at IS NULL ORDER BY m.joined_at ASC`,
    [liveRoomId]
  );
  return res.rows;
}

async function getRecentEvents(liveRoomId, limit = 40) {
  const res = await db.query(
    `SELECT event_type, payload, user_id, created_at FROM live_room_events
     WHERE live_room_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [liveRoomId, limit]
  );
  return res.rows.reverse();
}

async function buildSnapshot(channel) {
  const room = await findByChannel(channel);
  if (!room) return null;

  const members = await getActiveMembers(room.id);
  const events = await getRecentEvents(room.id, 30);

  const messages = events
    .filter((e) => e.event_type === 'chat' || e.event_type === 'join' || e.event_type === 'leave' || e.event_type === 'seat_join')
    .map((e) => {
      const p = parsePayload(e.payload);
      if (e.event_type === 'join') {
        return {
          id: `evt-${e.id}`,
          type: 'system',
          text: `${p.display_name || 'Someone'} joined`,
          at: e.created_at,
        };
      }
      if (e.event_type === 'leave') {
        return {
          id: `evt-${e.id}`,
          type: 'system',
          text: `${p.display_name || 'Someone'} left`,
          at: e.created_at,
        };
      }
      if (e.event_type === 'seat_join') {
        return {
          type: 'system',
          text: `${p.display_name || 'Someone'} joined a seat`,
          at: e.created_at,
        };
      }
      return {
        id: `evt-${e.id}`,
        type: 'chat',
        userId: e.user_id,
        user: p.user || 'User',
        text: p.text || '',
        lvl: p.lvl || 1,
        at: e.created_at,
      };
    });

  const gifts = events
    .filter((e) => e.event_type === 'gift')
    .slice(-5)
    .map((e) => parsePayload(e.payload));

  const seats = members
    .filter((m) => m.role === 'host' || m.role === 'speaker' || m.role === 'admin')
    .sort((a, b) => {
      const ai = a.seat_index != null ? Number(a.seat_index) : 999;
      const bi = b.seat_index != null ? Number(b.seat_index) : 999;
      if (ai !== bi) return ai - bi;
      return new Date(a.joined_at) - new Date(b.joined_at);
    })
    .map((m) => ({
      userId: m.user_id,
      name: m.display_name,
      profilePic: m.profile_pic || null,
      muted: m.is_muted,
      gifts: Number(m.gift_count),
      isHost: m.role === 'host',
      isAdmin: m.role === 'admin',
      seatIndex: m.seat_index,
      agoraUid: uidFromUserId(m.user_id),
    }));

  const onlineMembers = members.map((m) => ({
    userId: m.user_id,
    name: m.display_name,
    role: m.role,
    profilePic: m.profile_pic || null,
    muted: m.is_muted,
    seatIndex: m.seat_index,
    isOnline: true,
    agoraUid: uidFromUserId(m.user_id),
  }));

  let hostProfilePic = null;
  if (room.host_user_id) {
    const hostPicRes = await db.query(`SELECT profile_pic FROM users WHERE id = $1`, [room.host_user_id]);
    hostProfilePic = hostPicRes.rows[0]?.profile_pic || null;
  }

  return {
    channel: room.channel,
    type: room.room_type,
    roomId: room.id,
    hostId: room.host_user_id,
    hostName: room.host_display_name,
    hostProfilePic,
    viewers: room.viewer_count,
    pkStatus: room.pk_status,
    messages,
    gifts,
    seats,
    onlineMembers,
    isLocked: Boolean(room.is_locked),
    updatedAt: room.updated_at,
  };
}

async function logChatEvent(liveRoomId, userId, payload) {
  const res = await db.query(
    `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'chat', $3)
     RETURNING id`,
    [liveRoomId, userId, JSON.stringify(payload)]
  );
  return res.rows[0]?.id;
}

async function setMemberMuted(liveRoomId, userId, muted) {
  await db.query(
    `UPDATE live_room_members SET is_muted = $3 WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [liveRoomId, userId, Boolean(muted)]
  );
}

async function promoteToSpeaker({ channel, userId, displayName }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS n FROM live_room_members
     WHERE live_room_id = $1 AND left_at IS NULL AND role = 'speaker'`,
    [room.id]
  );
  if ((countRes.rows[0]?.n || 0) >= 14) {
    throw new Error('Party room is full — maximum 15 people on stage');
  }

  const memberRes = await db.query(
    `SELECT display_name FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [room.id, userId]
  );
  const name = String(displayName || memberRes.rows[0]?.display_name || 'Guest').slice(0, 32);

  await db.query(
    `UPDATE live_room_members SET role = 'speaker', display_name = COALESCE(NULLIF(display_name, ''), $3), seat_index = COALESCE(seat_index, (
      SELECT COALESCE(MAX(seat_index), 1) + 1 FROM live_room_members WHERE live_room_id = $1 AND left_at IS NULL AND role IN ('speaker', 'admin')
    ))
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL AND role = 'viewer'`,
    [room.id, userId, name]
  );

  await db.query(
    `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'seat_join', $3)`,
    [room.id, userId, JSON.stringify({ display_name: name })]
  );

  cacheRoom(channel, room);
  return room;
}

async function endRoom(channel, reason = 'host_ended') {
  const room = await findByChannel(channel);
  if (!room || room.status === 'ended') return null;

  await db.query(
    `UPDATE live_rooms SET status = 'ended', viewer_count = 0, ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [room.id]
  );
  await db.query(
    `UPDATE live_room_members SET left_at = CURRENT_TIMESTAMP WHERE live_room_id = $1 AND left_at IS NULL`,
    [room.id]
  );
  await db.query(
    `INSERT INTO live_room_events (live_room_id, event_type, payload) VALUES ($1, 'room_ended', $2)`,
    [room.id, JSON.stringify({ reason })]
  );
  const endedRow = (
    await db.query(`SELECT * FROM live_rooms WHERE id = $1`, [room.id])
  ).rows[0];
  if (endedRow) await recordSessionEnd(endedRow);
  roomCache.delete(channel);
  return { ...room, status: 'ended', ended_at: endedRow?.ended_at };
}

async function endIdleRooms(maxIdleMinutes = 5) {
  const res = await db.query(
    `UPDATE live_rooms SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active' AND updated_at < CURRENT_TIMESTAMP - ($1 || ' minutes')::interval
     RETURNING *`,
    [maxIdleMinutes]
  );
  for (const row of res.rows) {
    await recordSessionEnd(row);
    roomCache.delete(row.channel);
  }
  return res.rows.length;
}

async function recoverActiveRooms() {
  const res = await db.query(`SELECT channel FROM live_rooms WHERE status = 'active'`);
  for (const row of res.rows) {
    await buildSnapshot(row.channel);
  }
  console.log(`[live] Recovered ${res.rows.length} active room(s) from database`);
}

async function endOrphanRooms() {
  const res = await db.query(
    `UPDATE live_rooms SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active' AND viewer_count = 0
     RETURNING *`
  );
  for (const row of res.rows) {
    await recordSessionEnd(row);
    roomCache.delete(row.channel);
  }
  return res.rows.length;
}

async function listActiveRooms({ roomType, limit = 30, sort = 'trending' } = {}) {
  const params = [];
  let sql = `SELECT lr.channel, lr.room_type, lr.host_user_id, lr.host_display_name, lr.viewer_count, lr.status, lr.updated_at, lr.started_at,
                    COALESCE(u.profile_pic, w.profile_photo_url) AS host_profile_pic,
                    u.updated_at AS host_updated_at
             FROM live_rooms lr
             LEFT JOIN users u ON u.id = lr.host_user_id
             LEFT JOIN workers w ON w.user_id = u.id
             WHERE lr.status = 'active'
               AND lr.updated_at > CURRENT_TIMESTAMP - INTERVAL '12 hours'
               AND EXISTS (
                 SELECT 1 FROM live_room_members m
                 WHERE m.live_room_id = lr.id
                   AND m.role = 'host'
                   AND m.left_at IS NULL
               )`;
  if (roomType) {
    params.push(roomType);
    sql += ` AND lr.room_type = $${params.length}`;
  }
  const orderBy =
    sort === 'new'
      ? 'started_at DESC'
      : sort === 'nearby'
        ? 'viewer_count DESC, started_at DESC'
        : 'viewer_count DESC, updated_at DESC';
  params.push(Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50));
  sql += ` ORDER BY ${orderBy} LIMIT $${params.length}`;
  const res = await db.query(sql, params);
  return res.rows;
}

async function touchHeartbeat(channel, userId) {
  const room = await findByChannel(channel);
  if (!room || room.status !== 'active') return;
  await accumulateMemberWatchTime(room, userId, HEARTBEAT_SECONDS);
  const isHost = String(room.host_user_id) === String(userId);
  if (isHost) {
    await accumulateHostHeartbeat(room, userId, HEARTBEAT_SECONDS);
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS c FROM live_room_members WHERE live_room_id = $1 AND left_at IS NULL`,
      [room.id]
    );
    const viewers = countRes.rows[0]?.c || room.viewer_count || 0;
    await db.query(
      `UPDATE live_rooms SET updated_at = CURRENT_TIMESTAMP, viewer_count = $2,
       peak_viewer_count = GREATEST(COALESCE(peak_viewer_count, 0), $2)
       WHERE id = $1`,
      [room.id, viewers]
    );
    invalidateRoomCache(channel);
    return;
  }
  await db.query(`UPDATE live_rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [room.id]);
}

async function pruneStaleMembers(staleSeconds = 90) {
  const res = await db.query(
    `UPDATE live_room_members m SET left_at = CURRENT_TIMESTAMP
     FROM live_rooms r
     WHERE m.live_room_id = r.id AND m.left_at IS NULL AND r.status = 'active'
       AND m.last_seen_at < CURRENT_TIMESTAMP - ($1 || ' seconds')::interval
     RETURNING r.channel, m.user_id`,
    [staleSeconds]
  );
  for (const row of res.rows) {
    const updated = await leaveRoom({ channel: row.channel, userId: row.user_id });
    if (updated) cacheRoom(row.channel, updated);
  }
  return res.rows.length;
}

async function isUserBanned(liveRoomId, userId) {
  const res = await db.query(
    `SELECT 1 FROM live_room_bans WHERE live_room_id = $1 AND user_id = $2`,
    [liveRoomId, userId]
  );
  return res.rows.length > 0;
}

async function kickMember({ channel, userId, bannedBy, reason }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  await db.query(
    `INSERT INTO live_room_bans (live_room_id, user_id, banned_by, reason)
     VALUES ($1, $2, $3, $4) ON CONFLICT (live_room_id, user_id) DO NOTHING`,
    [room.id, userId, bannedBy || null, reason || null]
  );
  await leaveRoom({ channel, userId });
  return room;
}

async function canPublishInRoom(channel, userId) {
  const room = await findByChannel(channel);
  if (!room || room.status === 'ended') return false;
  if (String(room.host_user_id) === String(userId)) return true;
  const member = await db.query(
    `SELECT role FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [room.id, userId]
  );
  const role = String(member.rows[0]?.role || '');
  return room.room_type === 'party' && (role === 'speaker' || role === 'admin');
}

async function isRoomOwner(channel, userId) {
  const room = await findByChannel(channel);
  return room && String(room.host_user_id) === String(userId);
}

async function isRoomModerator(channel, userId) {
  const room = await findByChannel(channel);
  if (!room) return false;
  if (String(room.host_user_id) === String(userId)) return true;
  const member = await db.query(
    `SELECT role FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL LIMIT 1`,
    [room.id, userId]
  );
  return String(member.rows[0]?.role || '') === 'admin';
}

async function setMemberAdmin({ channel, userId, isAdmin }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  if (String(room.host_user_id) === String(userId)) {
    throw new Error('Cannot change host role');
  }
  const role = isAdmin ? 'admin' : 'viewer';
  await db.query(
    `UPDATE live_room_members SET role = $3
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL AND role != 'host'`,
    [room.id, userId, role]
  );
  invalidateRoomCache(channel);
  return room;
}

async function demoteSpeaker({ channel, userId }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  await db.query(
    `UPDATE live_room_members SET role = 'viewer', seat_index = NULL
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL AND role IN ('speaker', 'admin')`,
    [room.id, userId]
  );
  invalidateRoomCache(channel);
  return room;
}

async function moveMemberSeat({ channel, userId, seatIndex }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  const seat = Math.max(1, Math.min(15, parseInt(seatIndex, 10) || 1));
  const member = await db.query(
    `SELECT role FROM live_room_members WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [room.id, userId]
  );
  const role = member.rows[0]?.role;
  if (!role || role === 'viewer') {
    throw new Error('User must be on stage to move seats');
  }
  await db.query(
    `UPDATE live_room_members SET seat_index = $3 WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [room.id, userId, seat]
  );
  invalidateRoomCache(channel);
  return room;
}

async function setRoomLock({ channel, locked, password }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  let lockPassword = null;
  if (locked) {
    const raw = String(password || '').trim();
    if (!raw) throw new Error('Password required to lock room');
    lockPassword = crypto.createHash('sha256').update(raw).digest('hex');
  }
  await db.query(
    `UPDATE live_rooms SET is_locked = $2, lock_password = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [room.id, Boolean(locked), lockPassword]
  );
  invalidateRoomCache(channel);
  return { ...room, is_locked: Boolean(locked) };
}

async function verifyRoomPassword(channel, password) {
  const room = await findByChannel(channel);
  if (!room || !room.is_locked) return true;
  const hash = crypto.createHash('sha256').update(String(password || '').trim()).digest('hex');
  return room.lock_password === hash;
}

module.exports = {
  findByChannel,
  findById,
  hostRoom,
  joinRoom,
  leaveRoom,
  getActiveMembers,
  buildSnapshot,
  logChatEvent,
  setMemberMuted,
  promoteToSpeaker,
  endRoom,
  endIdleRooms,
  endOrphanRooms,
  recoverActiveRooms,
  listActiveRooms,
  touchHeartbeat,
  pruneStaleMembers,
  isUserBanned,
  kickMember,
  canPublishInRoom,
  isRoomOwner,
  isRoomModerator,
  setMemberAdmin,
  demoteSpeaker,
  moveMemberSeat,
  setRoomLock,
  verifyRoomPassword,
  roomCache,
};
