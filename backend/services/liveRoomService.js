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
const redis = require('../lib/redis');

const SEAT_REQUEST_TTL_SEC = 900;

function seatRequestStoreKey(channel) {
  return `live:seatreq:${String(channel || '').slice(0, 64)}`;
}

async function readSeatRequestMap(channel) {
  const raw = await redis.get(seatRequestStoreKey(channel));
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return {};
  }
}

async function addSeatRequest(channel, userId, name) {
  if (!channel || !userId) return;
  const map = await readSeatRequestMap(channel);
  map[String(userId)] = {
    name: String(name || 'Guest').slice(0, 32),
    at: Date.now(),
  };
  await redis.set(seatRequestStoreKey(channel), JSON.stringify(map), SEAT_REQUEST_TTL_SEC);
}

async function removeSeatRequest(channel, userId) {
  if (!channel || !userId) return;
  const map = await readSeatRequestMap(channel);
  delete map[String(userId)];
  await redis.set(seatRequestStoreKey(channel), JSON.stringify(map), SEAT_REQUEST_TTL_SEC);
}

async function clearSeatRequests(channel) {
  if (!channel) return;
  await redis.del(seatRequestStoreKey(channel));
}

async function listSeatRequests(channel) {
  const map = await readSeatRequestMap(channel);
  const room = await findByChannel(channel);
  if (!room) return [];
  const members = await getActiveMembers(room.id);
  const onStage = new Set(
    members
      .filter(
        (m) =>
          m.role === 'host' ||
          m.role === 'speaker' ||
          m.role === 'admin' ||
          m.seat_index != null
      )
      .map((m) => String(m.user_id))
  );
  return Object.entries(map)
    .filter(([uid]) => !onStage.has(uid))
    .map(([uid, v]) => ({
      userId: uid,
      id: uid,
      name: v?.name || 'Guest',
      at: v?.at || 0,
    }))
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

/** In-memory hot cache — DB is source of truth. */
const roomCache = new Map();
const roomStyleByChannel = new Map();
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

  if (!asHost) {
    await assertUserNotBanned(room.id, userId);
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
         role = CASE WHEN $4::text = 'host' THEN 'host' ELSE live_room_members.role END,
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
    `UPDATE live_room_members
     SET left_at = CURRENT_TIMESTAMP,
         role = CASE
           WHEN role = 'host' THEN 'host'
           WHEN role = 'admin' THEN 'admin'
           ELSE 'viewer'
         END,
         seat_index = CASE WHEN role = 'host' THEN seat_index ELSE NULL END
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
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

async function getMemberProfilePic(userId) {
  if (!userId) return null;
  const res = await db.query(`SELECT profile_pic FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return res.rows[0]?.profile_pic || null;
}

async function getActiveMembers(liveRoomId) {
  const res = await db.query(
    `SELECT m.user_id, m.display_name, m.role, m.is_muted, m.is_chat_muted, m.gift_count, m.joined_at, m.seat_index,
            m.last_seen_at, u.profile_pic, u.display_id, u.role AS user_role
     FROM live_room_members m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.live_room_id = $1 AND m.left_at IS NULL ORDER BY m.joined_at ASC`,
    [liveRoomId]
  );
  return res.rows;
}

function isPlatformAdminRole(role) {
  return ['admin', 'super_admin', 'founder', 'ceo'].includes(String(role || '').toLowerCase());
}

async function getRecentEvents(liveRoomId, limit = 40) {
  const res = await db.query(
    `SELECT id, event_type, payload, user_id, created_at FROM live_room_events
     WHERE live_room_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [liveRoomId, limit]
  );
  return res.rows.reverse();
}

/** Prefer real chat/gifts so join/leave spam does not wipe the visible history. */
async function getRecentChatFeed(liveRoomId) {
  const chats = await db.query(
    `SELECT id, event_type, payload, user_id, created_at FROM live_room_events
     WHERE live_room_id = $1 AND event_type IN ('chat', 'gift')
       AND COALESCE((payload->>'deleted')::boolean, false) = false
     ORDER BY created_at DESC LIMIT 80`,
    [liveRoomId]
  );
  const system = await db.query(
    `SELECT id, event_type, payload, user_id, created_at FROM live_room_events
     WHERE live_room_id = $1 AND event_type IN ('join', 'leave', 'seat_join')
       AND COALESCE((payload->>'deleted')::boolean, false) = false
     ORDER BY created_at DESC LIMIT 25`,
    [liveRoomId]
  );
  return [...chats.rows, ...system.rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

async function buildSnapshot(channel) {
  const room = await findByChannel(channel);
  if (!room) return null;

  const members = await getActiveMembers(room.id);
  const profileByUser = new Map(
    members.map((m) => [String(m.user_id), m.profile_pic || null])
  );
  const events = await getRecentChatFeed(room.id);

  const messages = events
    .filter((e) => e.event_type === 'chat' || e.event_type === 'join' || e.event_type === 'leave' || e.event_type === 'seat_join' || e.event_type === 'gift')
    .map((e) => {
      const p = parsePayload(e.payload);
      const eventId = e.id != null ? String(e.id) : `t-${new Date(e.created_at).getTime()}`;
      if (e.event_type === 'join') {
        return {
          id: `evt-${eventId}`,
          type: 'system',
          text: `${p.display_name || 'Someone'} joined`,
          user: p.display_name || 'Someone',
          userId: e.user_id || null,
          at: e.created_at,
        };
      }
      if (e.event_type === 'leave') {
        return {
          id: `evt-${eventId}`,
          type: 'system',
          text: `${p.display_name || 'Someone'} left`,
          user: p.display_name || 'Someone',
          userId: e.user_id || null,
          at: e.created_at,
        };
      }
      if (e.event_type === 'seat_join') {
        return {
          id: `evt-${eventId}`,
          type: 'system',
          text: `${p.display_name || 'Someone'} joined a seat`,
          user: p.display_name || 'Someone',
          userId: e.user_id || null,
          at: e.created_at,
        };
      }
      if (e.event_type === 'gift') {
        const coins = Number(p.amount || p.coin_amount || p.coins || 0);
        return {
          id: `evt-${eventId}`,
          type: 'gift',
          user: p.from || p.senderName || 'User',
          userId: e.user_id || p.fromUserId || null,
          text: `${p.emoji || '🎁'} sent to ${p.to || p.recipientName || 'Host'}${coins ? ` · ${coins} coins` : ''}`,
          gift: {
            from: p.from || p.senderName || 'User',
            fromUserId: e.user_id || p.fromUserId || null,
            to: p.to || p.recipientName || 'Host',
            toUserId: p.toUserId || p.receiver_id || null,
            emoji: p.emoji || '🎁',
            amount: coins,
            ...p,
          },
          at: e.created_at,
        };
      }
      return {
        id: `evt-${eventId}`,
        type: 'chat',
        userId: e.user_id,
        user: p.user || 'User',
        text: p.text || '',
        lvl: p.lvl || 1,
        profilePic: p.profilePic || (e.user_id ? profileByUser.get(String(e.user_id)) || null : null),
        at: e.created_at,
      };
    });

  const gifts = events
    .filter((e) => e.event_type === 'gift')
    .slice(-20)
    .map((e) => {
      const p = parsePayload(e.payload);
      return {
        id: e.id != null ? String(e.id) : undefined,
        from: p.from || p.senderName || 'User',
        fromUserId: e.user_id || p.fromUserId || null,
        to: p.to || p.recipientName || 'Host',
        toUserId: p.toUserId || p.receiver_id || null,
        emoji: p.emoji || '🎁',
        amount: Number(p.amount || p.coin_amount || p.coins || 0),
        at: e.created_at,
        ...p,
      };
    });

  const seats = members
    .filter(
      (m) =>
        m.role === 'host' ||
        m.role === 'speaker' ||
        m.seat_index != null
    )
    .sort((a, b) => {
      const ai = a.seat_index != null ? Number(a.seat_index) : 999;
      const bi = b.seat_index != null ? Number(b.seat_index) : 999;
      if (ai !== bi) return ai - bi;
      return new Date(a.joined_at) - new Date(b.joined_at);
    })
    .map((m) => ({
      userId: m.user_id,
      displayId: m.display_id != null ? String(m.display_id) : null,
      name: m.display_name,
      profilePic: m.profile_pic || null,
      muted: m.is_muted,
      chatMuted: Boolean(m.is_chat_muted),
      gifts: Number(m.gift_count),
      isHost: m.role === 'host',
      isAdmin: m.role === 'admin' || isPlatformAdminRole(m.user_role),
      isPlatformAdmin: isPlatformAdminRole(m.user_role),
      userRole: m.user_role || null,
      seatIndex: m.seat_index,
      agoraUid: uidFromUserId(m.user_id),
      role: m.role === 'viewer' && m.seat_index != null ? 'speaker' : m.role,
    }));

  const onlineMembers = members.map((m) => ({
    userId: m.user_id,
    displayId: m.display_id != null ? String(m.display_id) : null,
    name: m.display_name,
    role: m.role,
    userRole: m.user_role || null,
    profilePic: m.profile_pic || null,
    muted: m.is_muted,
    chatMuted: Boolean(m.is_chat_muted),
    seatIndex: m.seat_index,
    isOnline: true,
    isAdmin: m.role === 'admin' || isPlatformAdminRole(m.user_role),
    isPlatformAdmin: isPlatformAdminRole(m.user_role),
    agoraUid: uidFromUserId(m.user_id),
  }));

  let hostProfilePic = null;
  let hostDisplayId = null;
  let hostIsPlatformAdmin = false;
  let hostUserRole = null;
  if (room.host_user_id) {
    const hostPicRes = await db.query(
      `SELECT profile_pic, display_id, role FROM users WHERE id = $1`,
      [room.host_user_id]
    );
    hostProfilePic = hostPicRes.rows[0]?.profile_pic || null;
    hostDisplayId =
      hostPicRes.rows[0]?.display_id != null ? String(hostPicRes.rows[0].display_id) : null;
    hostIsPlatformAdmin = isPlatformAdminRole(hostPicRes.rows[0]?.role);
    hostUserRole = hostPicRes.rows[0]?.role || null;
  }

  const seatRequests = await listSeatRequests(channel);

  return {
    channel: room.channel,
    type: room.room_type,
    roomId: room.id,
    hostId: room.host_user_id,
    hostName: room.host_display_name,
    hostDisplayId,
    hostProfilePic,
    hostIsPlatformAdmin,
    hostUserRole,
    viewers: room.viewer_count,
    pkStatus: room.pk_status,
    messages,
    gifts,
    seats,
    onlineMembers,
    seatRequests,
    isLocked: Boolean(room.is_locked),
    chatLocked: Boolean(room.is_chat_locked),
    updatedAt: room.updated_at,
    roomStyle: getRoomStyle(room.channel),
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

async function setMemberChatMuted(liveRoomId, userId, muted) {
  await db.query(
    `UPDATE live_room_members SET is_chat_muted = $3
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [liveRoomId, userId, Boolean(muted)]
  );
}

async function isMemberChatMuted(liveRoomId, userId) {
  const res = await db.query(
    `SELECT is_chat_muted FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL LIMIT 1`,
    [liveRoomId, userId]
  );
  return Boolean(res.rows[0]?.is_chat_muted);
}

function parseChatEventId(messageId) {
  const raw = String(messageId || '').trim();
  if (!raw) return null;
  const m = raw.match(/^evt-(.+)$/i);
  return m ? m[1] : raw;
}

async function softDeleteChatEvent({ liveRoomId, messageId, deletedBy }) {
  const eventId = parseChatEventId(messageId);
  if (!eventId) throw new Error('Invalid message id');
  const res = await db.query(
    `UPDATE live_room_events
     SET payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb
     WHERE id = $1::uuid AND live_room_id = $2 AND event_type = 'chat'
       AND COALESCE((payload->>'deleted')::boolean, false) = false
     RETURNING id, user_id, payload`,
    [
      eventId,
      liveRoomId,
      JSON.stringify({
        deleted: true,
        deleted_by: deletedBy || null,
        deleted_at: new Date().toISOString(),
      }),
    ]
  );
  if (!res.rows[0]) throw new Error('Message not found or already removed');
  return {
    id: `evt-${res.rows[0].id}`,
    userId: res.rows[0].user_id,
  };
}

async function setRoomChatLocked({ channel, locked }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  await db.query(
    `UPDATE live_rooms SET is_chat_locked = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [room.id, Boolean(locked)]
  );
  invalidateRoomCache(channel);
  return { ...room, is_chat_locked: Boolean(locked) };
}

async function clearRoomChat({ liveRoomId, clearedBy }) {
  const meta = JSON.stringify({
    deleted: true,
    cleared: true,
    deleted_by: clearedBy || null,
    deleted_at: new Date().toISOString(),
  });
  const res = await db.query(
    `UPDATE live_room_events
     SET payload = COALESCE(payload, '{}'::jsonb) || $2::jsonb
     WHERE live_room_id = $1
       AND event_type IN ('chat', 'gift', 'join', 'leave', 'seat_join')
       AND COALESCE((payload->>'deleted')::boolean, false) = false
     RETURNING id`,
    [liveRoomId, meta]
  );
  return { cleared: res.rowCount || 0 };
}

async function muteAllMembersChat({ liveRoomId, muted, excludeUserIds = [] }) {
  const exclude = (excludeUserIds || []).filter(Boolean).map(String);
  if (exclude.length) {
    await db.query(
      `UPDATE live_room_members
       SET is_chat_muted = $2
       WHERE live_room_id = $1
         AND left_at IS NULL
         AND role != 'host'
         AND NOT (user_id::text = ANY($3::text[]))`,
      [liveRoomId, Boolean(muted), exclude]
    );
  } else {
    await db.query(
      `UPDATE live_room_members
       SET is_chat_muted = $2
       WHERE live_room_id = $1 AND left_at IS NULL AND role != 'host'`,
      [liveRoomId, Boolean(muted)]
    );
  }
}

function maxSpeakersForRoom(room) {
  if (!room) return 14;
  /* Live: host + 4 guests = 5 on stream. Party: host + 14 guests. */
  return room.room_type === 'live' ? 4 : 14;
}

async function countActiveStageGuests(liveRoomId, excludeUserId, client) {
  const q = client || db;
  const countRes = await q.query(
    `SELECT COUNT(*)::int AS n FROM live_room_members
     WHERE live_room_id = $1 AND left_at IS NULL
       AND role <> 'host'
       AND (
         role = 'speaker'
         OR role = 'admin'
         OR seat_index IS NOT NULL
       )
       AND ($2::uuid IS NULL OR user_id <> $2::uuid)`,
    [liveRoomId, excludeUserId || null]
  );
  return countRes.rows[0]?.n || 0;
}

async function promoteToSpeaker({ channel, userId, displayName, seatIndex = null }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');

  const maxSpeakers = maxSpeakersForRoom(room);
  await ensureMemberInRoom({ channel, userId, displayName });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    /* Serialize seat promotions so live cannot exceed max 5 (host + 4 guests). */
    await client.query(`SELECT id FROM live_rooms WHERE id = $1 FOR UPDATE`, [room.id]);

    const memberRes = await client.query(
      `SELECT display_name, role, seat_index FROM live_room_members
       WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL
       FOR UPDATE`,
      [room.id, userId]
    );
    if (!memberRes.rows[0]) {
      throw new Error('User is not in this room — they must join the live first');
    }
    if (memberRes.rows[0].role === 'host') throw new Error('Host is already on stage');

    const alreadyOnStage =
      memberRes.rows[0].role === 'speaker' ||
      memberRes.rows[0].role === 'admin' ||
      memberRes.rows[0].seat_index != null;

    if (!alreadyOnStage) {
      const onStage = await countActiveStageGuests(room.id, userId, client);
      if (onStage >= maxSpeakers) {
        const label =
          room.room_type === 'live'
            ? 'Live stage is full — max 5 people (host + 4 guests)'
            : 'Party room is full — maximum 15 people on stage';
        throw new Error(label);
      }
    }

    const name = String(displayName || memberRes.rows[0]?.display_name || 'Guest').slice(0, 32);
    const preferredSeat =
      seatIndex != null && seatIndex !== ''
        ? Math.max(1, Math.min(15, parseInt(seatIndex, 10) || 1))
        : null;

    const updated = await client.query(
      `UPDATE live_room_members SET
         role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'speaker' END,
         display_name = COALESCE(NULLIF(display_name, ''), $3),
         seat_index = COALESCE(
           $4::int,
           seat_index,
           (
             SELECT COALESCE(MAX(seat_index), 1) + 1
             FROM live_room_members
             WHERE live_room_id = $1 AND left_at IS NULL AND role IN ('speaker', 'admin', 'host')
           )
         ),
         last_seen_at = CURRENT_TIMESTAMP
       WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL AND role IN ('viewer', 'admin', 'speaker')
       RETURNING user_id, role, seat_index`,
      [room.id, userId, name, preferredSeat]
    );

    if (!updated.rows[0]) {
      throw new Error('Could not place guest on seat — ask them to rejoin the room');
    }

    /* Final guard after write (admins already on stage excluded from "new" path). */
    if (!alreadyOnStage) {
      const after = await countActiveStageGuests(room.id, null, client);
      if (after > maxSpeakers) {
        throw new Error(
          room.room_type === 'live'
            ? 'Live stage is full — max 5 people (host + 4 guests)'
            : 'Party room is full — maximum 15 people on stage'
        );
      }
    }

    await client.query(
      `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'seat_join', $3)`,
      [room.id, userId, JSON.stringify({ display_name: name, seat_index: updated.rows[0].seat_index })]
    );

    await client.query('COMMIT');
    invalidateRoomCache(channel);
    return { room, member: updated.rows[0] };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

async function ensureMemberInRoom({ channel, userId, displayName }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  if (room.status === 'ended') throw new Error('This live has ended');

  await assertUserNotBanned(room.id, userId);

  const existing = await db.query(
    `SELECT role, seat_index, left_at FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 LIMIT 1`,
    [room.id, userId]
  );
  const row = existing.rows[0];
  if (row && row.left_at == null) {
    return row;
  }

  const name = String(displayName || 'Guest').slice(0, 32);
  if (row) {
    /* Re-admit viewers who were pruned / briefly disconnected but are still watching */
    await db.query(
      `UPDATE live_room_members SET
         left_at = NULL,
         display_name = COALESCE(NULLIF(display_name, ''), $3),
         last_seen_at = CURRENT_TIMESTAMP,
         joined_at = CURRENT_TIMESTAMP
       WHERE live_room_id = $1 AND user_id = $2`,
      [room.id, userId, name]
    );
  } else {
    await joinRoom({ channel, userId, displayName: name, asHost: false });
  }
  invalidateRoomCache(channel);
  const again = await db.query(
    `SELECT role, seat_index, left_at FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL LIMIT 1`,
    [room.id, userId]
  );
  return again.rows[0] || null;
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
  await clearSeatRequests(channel);
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
  // End rooms that are empty, OR whose host stopped heartbeating.
  // Viewer heartbeats alone used to keep ghost lives listed while Agora was empty
  // (host left media but socket members / updated_at stayed fresh).
  const res = await db.query(
    `UPDATE live_rooms lr SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE lr.status = 'active'
       AND (
         (
           lr.updated_at < CURRENT_TIMESTAMP - INTERVAL '3 minutes'
           AND NOT EXISTS (
             SELECT 1 FROM live_room_members m
             WHERE m.live_room_id = lr.id AND m.left_at IS NULL
           )
         )
         OR NOT EXISTS (
           SELECT 1 FROM live_room_members hm
           WHERE hm.live_room_id = lr.id
             AND hm.user_id = lr.host_user_id
             AND hm.left_at IS NULL
             AND hm.last_seen_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
         )
       )
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
  // Only list rooms whose host is still heartbeating. Do NOT use room.updated_at
  // alone — viewers also touch that timestamp and kept empty Agora channels listed.
  let sql = `SELECT lr.channel, lr.room_type, lr.host_user_id, lr.host_display_name, lr.viewer_count, lr.status, lr.updated_at, lr.started_at,
                    COALESCE(u.profile_pic, w.profile_photo_url) AS host_profile_pic,
                    u.updated_at AS host_updated_at,
                    u.display_id AS host_display_id
             FROM live_rooms lr
             LEFT JOIN users u ON u.id = lr.host_user_id
             LEFT JOIN workers w ON w.user_id = u.id
             WHERE lr.status = 'active'
               AND lr.updated_at > CURRENT_TIMESTAMP - INTERVAL '12 hours'
               AND lr.host_user_id IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM live_room_members m
                 WHERE m.live_room_id = lr.id
                   AND m.user_id = lr.host_user_id
                   AND m.left_at IS NULL
                   AND m.last_seen_at > CURRENT_TIMESTAMP - INTERVAL '2 minutes'
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
  try {
    const res = await db.query(sql, params);
    return res.rows;
  } catch (err) {
    // Older DBs without users.display_id — retry without that column
    if (String(err.message || '').includes('display_id')) {
      const fallbackSql = sql.replace(/,\s*u\.display_id AS host_display_id/, '');
      const res = await db.query(fallbackSql, params);
      return res.rows;
    }
    throw err;
  }
}

async function isMemberRecentlySeen(channel, userId, withinSeconds = 90) {
  const room = await findByChannel(channel);
  if (!room || !userId) return false;
  const sec = Math.max(15, Math.min(600, Number(withinSeconds) || 90));
  const res = await db.query(
    `SELECT 1 FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL
       AND last_seen_at > CURRENT_TIMESTAMP - ($3 || ' seconds')::interval
     LIMIT 1`,
    [room.id, userId, String(sec)]
  );
  return Boolean(res.rows[0]);
}

async function isMemberOnStage(channel, userId) {
  const room = await findByChannel(channel);
  if (!room || !userId) return false;
  const res = await db.query(
    `SELECT 1 FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL
       AND (
         role IN ('speaker', 'admin', 'host')
         OR seat_index IS NOT NULL
       )
     LIMIT 1`,
    [room.id, userId]
  );
  return Boolean(res.rows[0]);
}

async function touchHeartbeat(channel, userId) {
  const room = await findByChannel(channel);
  if (!room || room.status !== 'active') return;
  await accumulateMemberWatchTime(room, userId, HEARTBEAT_SECONDS);
  await db.query(
    `UPDATE live_room_members SET last_seen_at = CURRENT_TIMESTAMP
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [room.id, userId]
  );
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
  const viewerStale = Math.max(45, Number(staleSeconds) || 90);
  const stageStale = Math.max(viewerStale * 2, 180);
  const res = await db.query(
    `SELECT r.channel, m.user_id
     FROM live_room_members m
     JOIN live_rooms r ON r.id = m.live_room_id
     WHERE m.left_at IS NULL AND r.status = 'active'
       AND m.role <> 'host'
       AND (
         (
           m.role = 'viewer'
           AND m.seat_index IS NULL
           AND m.last_seen_at < CURRENT_TIMESTAMP - ($1 || ' seconds')::interval
         )
         OR (
           (m.role IN ('speaker', 'admin') OR m.seat_index IS NOT NULL)
           AND m.last_seen_at < CURRENT_TIMESTAMP - ($2 || ' seconds')::interval
         )
       )`,
    [String(viewerStale), String(stageStale)]
  );
  for (const row of res.rows) {
    const updated = await leaveRoom({ channel: row.channel, userId: row.user_id });
    if (updated) cacheRoom(row.channel, updated);
  }
  return res.rows.length;
}

async function isUserBanned(liveRoomId, userId) {
  const ban = await getActiveBan(liveRoomId, userId);
  return Boolean(ban);
}

async function getActiveBan(liveRoomId, userId) {
  if (!liveRoomId || !userId) return null;
  const res = await db.query(
    `SELECT reason, expires_at, created_at FROM live_room_bans
     WHERE live_room_id = $1 AND user_id = $2
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     LIMIT 1`,
    [liveRoomId, userId]
  );
  return res.rows[0] || null;
}

async function getActiveBanByChannel(channel, userId) {
  const room = await findByChannel(channel);
  if (!room) return null;
  return getActiveBan(room.id, userId);
}

function banBlockPayload(ban) {
  if (!ban) return null;
  const expiresAt = ban.expires_at || null;
  let remainingHours = null;
  if (expiresAt) {
    remainingHours = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3600000));
  }
  const until = expiresAt
    ? new Date(expiresAt).toLocaleString()
    : null;
  const message = expiresAt
    ? `You can't enter this live for ${remainingHours} more hour${remainingHours === 1 ? '' : 's'} (until ${until}).`
    : 'You are blocked from this live permanently and cannot rejoin.';
  return {
    banned: true,
    expiresAt,
    remainingHours,
    permanent: !expiresAt,
    message,
    reason: ban.reason || null,
  };
}

async function assertUserNotBanned(liveRoomId, userId) {
  const ban = await getActiveBan(liveRoomId, userId);
  if (!ban) return null;
  const info = banBlockPayload(ban);
  const err = new Error(info.message);
  err.code = 'ROOM_BANNED';
  err.ban = info;
  throw err;
}

/**
 * Kick + ban from this room.
 * @param {object} opts
 * @param {number|null} [opts.durationHours] - hours until ban lifts; omit/null = permanent for room
 */
async function kickMember({ channel, userId, bannedBy, reason, durationHours }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  if (String(room.host_user_id) === String(userId)) {
    throw new Error('Cannot remove the room host');
  }

  let hours = durationHours === undefined || durationHours === '' ? null : Number(durationHours);
  if (hours === 0) {
    hours = null; /* permanent for this room */
  } else if (hours != null) {
    if (!Number.isFinite(hours) || hours < 2) {
      throw new Error('Ban duration must be at least 2 hours (or 0 for permanent)');
    }
    hours = Math.min(Math.floor(hours), 24 * 365);
  }

  const expiresAt =
    hours == null
      ? null
      : new Date(Date.now() + hours * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO live_room_bans (live_room_id, user_id, banned_by, reason, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (live_room_id, user_id) DO UPDATE SET
       banned_by = EXCLUDED.banned_by,
       reason = EXCLUDED.reason,
       expires_at = EXCLUDED.expires_at,
       created_at = CURRENT_TIMESTAMP`,
    [room.id, userId, bannedBy || null, reason || null, expiresAt]
  );
  /* Host removing them from live also strips room-admin (explicit kick) */
  await db.query(
    `UPDATE live_room_members
     SET role = CASE WHEN role = 'host' THEN 'host' ELSE 'viewer' END
     WHERE live_room_id = $1 AND user_id = $2`,
    [room.id, userId]
  );
  await leaveRoom({ channel, userId });
  const ban = { reason: reason || null, expires_at: expiresAt };
  return {
    room,
    expiresAt,
    durationHours: hours,
    ban: banBlockPayload(ban),
  };
}

async function canPublishInRoom(channel, userId) {
  const room = await findByChannel(channel);
  if (!room || room.status === 'ended') return false;
  if (String(room.host_user_id) === String(userId)) return true;
  const member = await db.query(
    `SELECT role, seat_index FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [room.id, userId]
  );
  const row = member.rows[0];
  if (!row) return false;
  const role = String(row.role || '');
  if (role === 'speaker' || role === 'admin') return true;
  // On-seat guests must get a publisher token even if role briefly lags behind seat_index
  if (row.seat_index != null && (room.room_type === 'party' || room.room_type === 'live')) {
    return true;
  }
  return false;
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

async function listRoomAdminUserIds(roomId) {
  if (!roomId) return [];
  const res = await db.query(
    `SELECT user_id FROM live_room_members
     WHERE live_room_id = $1 AND left_at IS NULL AND role = 'admin'`,
    [roomId]
  );
  return res.rows.map((r) => String(r.user_id));
}

async function setMemberAdmin({ channel, userId, isAdmin }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  if (String(room.host_user_id) === String(userId)) {
    throw new Error('Cannot change host role');
  }
  if (isAdmin) {
    await db.query(
      `UPDATE live_room_members SET role = 'admin'
       WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL AND role != 'host'`,
      [room.id, userId]
    );
  } else {
    /* Keep speaker if they still have a seat */
    await db.query(
      `UPDATE live_room_members
       SET role = CASE WHEN seat_index IS NOT NULL THEN 'speaker' ELSE 'viewer' END
       WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL AND role != 'host'`,
      [room.id, userId]
    );
  }
  invalidateRoomCache(channel);
  return room;
}

async function demoteSpeaker({ channel, userId }) {
  const room = await findByChannel(channel);
  if (!room) throw new Error('Room not found');
  const res = await db.query(
    `UPDATE live_room_members
     SET seat_index = NULL,
         role = CASE
           WHEN role = 'host' THEN role
           WHEN role = 'admin' THEN 'admin'
           ELSE 'viewer'
         END
     WHERE live_room_id = $1
       AND user_id = $2
       AND left_at IS NULL
       AND role <> 'host'
       AND (seat_index IS NOT NULL OR role IN ('speaker', 'admin'))
     RETURNING user_id, role`,
    [room.id, userId]
  );
  if (!res.rows[0]) throw new Error('User is not on a seat');
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

function getRoomStyle(channel) {
  return roomStyleByChannel.get(channel) || { backgroundId: 'cosmic' };
}

async function setRoomStyle(channel, { backgroundId } = {}) {
  const style = { backgroundId: backgroundId || 'cosmic', at: Date.now() };
  roomStyleByChannel.set(channel, style);
  const room = await findByChannel(channel);
  if (room) {
    try {
      await db.query(
        `INSERT INTO live_room_events (live_room_id, event_type, payload) VALUES ($1, 'room_style', $2)`,
        [room.id, JSON.stringify(style)]
      );
    } catch (_e) {}
  }
  return style;
}

async function hostStepAway({ channel, userId }) {
  const room = await findByChannel(channel);
  if (!room) return { ended: true, remaining: 0 };
  // Keep host membership alive so the room stays listed; only end if truly empty.
  // Marking host left_at used to hide the room from /live/rooms immediately.
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM live_room_members WHERE live_room_id = $1 AND left_at IS NULL AND user_id <> $2`,
    [room.id, userId]
  );
  const remaining = countRes.rows[0]?.c || 0;
  if (remaining === 0) {
    await endRoom(channel, 'empty_after_host_left');
    return { ended: true, remaining: 0 };
  }
  await db.query(
    `UPDATE live_rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [room.id]
  );
  invalidateRoomCache(channel);
  return { ended: false, remaining };
}

module.exports = {
  findByChannel,
  findById,
  hostRoom,
  joinRoom,
  leaveRoom,
  getActiveMembers,
  getMemberProfilePic,
  buildSnapshot,
  logChatEvent,
  setMemberMuted,
  setMemberChatMuted,
  isMemberChatMuted,
  softDeleteChatEvent,
  setRoomChatLocked,
  clearRoomChat,
  muteAllMembersChat,
  promoteToSpeaker,
  ensureMemberInRoom,
  addSeatRequest,
  removeSeatRequest,
  listSeatRequests,
  clearSeatRequests,
  endRoom,
  endIdleRooms,
  endOrphanRooms,
  recoverActiveRooms,
  listActiveRooms,
  touchHeartbeat,
  isMemberRecentlySeen,
  isMemberOnStage,
  pruneStaleMembers,
  isUserBanned,
  getActiveBan,
  getActiveBanByChannel,
  banBlockPayload,
  assertUserNotBanned,
  kickMember,
  canPublishInRoom,
  maxSpeakersForRoom,
  isRoomOwner,
  isRoomModerator,
  listRoomAdminUserIds,
  setMemberAdmin,
  demoteSpeaker,
  moveMemberSeat,
  setRoomLock,
  verifyRoomPassword,
  getRoomStyle,
  setRoomStyle,
  hostStepAway,
  roomCache,
};
