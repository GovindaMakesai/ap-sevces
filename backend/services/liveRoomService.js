const db = require('../config/database');

/** In-memory hot cache — DB is source of truth. TODO: Redis cache layer. */
const roomCache = new Map();

async function findByChannel(channel) {
  const res = await db.query(`SELECT * FROM live_rooms WHERE channel = $1 LIMIT 1`, [channel]);
  return res.rows[0] || null;
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
         ended_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE channel = $4`,
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
      `INSERT INTO live_room_members (live_room_id, user_id, display_name, role, left_at)
       VALUES ($1, $2, $3, 'host', NULL)
       ON CONFLICT (live_room_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, role = 'host', left_at = NULL, joined_at = CURRENT_TIMESTAMP`,
      [liveRoom.id, hostUserId, hostDisplayName]
    );

    await client.query(
      `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload)
       VALUES ($1, $2, 'room_started', $3)`,
      [liveRoom.id, hostUserId, JSON.stringify({ channel, room_type: roomType })]
    );

    await client.query('COMMIT');
    roomCache.set(channel, liveRoom);
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

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO live_room_members (live_room_id, user_id, display_name, role, left_at)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (live_room_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, left_at = NULL, joined_at = CURRENT_TIMESTAMP`,
      [room.id, userId, displayName, asHost ? 'host' : 'viewer']
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

    await client.query(
      `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'join', $3)`,
      [room.id, userId, JSON.stringify({ display_name: displayName })]
    );

    room = (await client.query(`SELECT * FROM live_rooms WHERE id = $1`, [room.id])).rows[0];
    await client.query('COMMIT');
    roomCache.set(channel, room);
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

  await db.query(
    `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'leave', '{}')`,
    [room.id, userId]
  );

  return { ...room, viewer_count: viewers };
}

async function getActiveMembers(liveRoomId) {
  const res = await db.query(
    `SELECT user_id, display_name, role, is_muted, gift_count, joined_at
     FROM live_room_members WHERE live_room_id = $1 AND left_at IS NULL ORDER BY joined_at ASC`,
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
    .filter((e) => e.event_type === 'chat' || e.event_type === 'join' || e.event_type === 'seat_join')
    .map((e) => {
      const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload || {};
      if (e.event_type === 'join') {
        return { type: 'system', text: `${p.display_name || 'Someone'} joined`, at: e.created_at };
      }
      if (e.event_type === 'seat_join') {
        return {
          type: 'system',
          text: `${p.display_name || 'Someone'} joined a seat`,
          at: e.created_at,
        };
      }
      return {
        type: 'chat',
        user: p.user || 'User',
        text: p.text || '',
        lvl: p.lvl || 1,
        at: e.created_at,
      };
    });

  const gifts = events
    .filter((e) => e.event_type === 'gift')
    .slice(-5)
    .map((e) => {
      const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload || {};
      return p;
    });

  const seats = members
    .filter((m) => m.role === 'host' || m.role === 'speaker')
    .map((m) => ({
      userId: m.user_id,
      name: m.display_name,
      muted: m.is_muted,
      gifts: Number(m.gift_count),
      isHost: m.role === 'host',
    }));

  return {
    channel: room.channel,
    type: room.room_type,
    roomId: room.id,
    hostId: room.host_user_id,
    hostName: room.host_display_name,
    viewers: room.viewer_count,
    pkStatus: room.pk_status,
    messages,
    gifts,
    seats,
    updatedAt: room.updated_at,
  };
}

async function logChatEvent(liveRoomId, userId, payload) {
  await db.query(
    `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'chat', $3)`,
    [liveRoomId, userId, JSON.stringify(payload)]
  );
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

  const memberRes = await db.query(
    `SELECT display_name FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [room.id, userId]
  );
  const name = String(displayName || memberRes.rows[0]?.display_name || 'Guest').slice(0, 32);

  await db.query(
    `UPDATE live_room_members SET role = 'speaker', display_name = COALESCE(NULLIF(display_name, ''), $3)
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL AND role = 'viewer'`,
    [room.id, userId, name]
  );

  await db.query(
    `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload) VALUES ($1, $2, 'seat_join', $3)`,
    [room.id, userId, JSON.stringify({ display_name: name })]
  );

  roomCache.set(channel, room);
  return room;
}

async function endRoom(channel, reason = 'host_ended') {
  const room = await findByChannel(channel);
  if (!room || room.status === 'ended') return null;

  await db.query(
    `UPDATE live_rooms SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
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
  roomCache.delete(channel);
  return { ...room, status: 'ended' };
}

async function endIdleRooms(maxIdleMinutes = 120) {
  const res = await db.query(
    `UPDATE live_rooms SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active' AND updated_at < CURRENT_TIMESTAMP - ($1 || ' minutes')::interval
     RETURNING channel`,
    [maxIdleMinutes]
  );
  for (const row of res.rows) roomCache.delete(row.channel);
  return res.rows.length;
}

async function recoverActiveRooms() {
  const res = await db.query(`SELECT channel FROM live_rooms WHERE status = 'active'`);
  for (const row of res.rows) {
    await buildSnapshot(row.channel);
  }
  console.log(`[live] Recovered ${res.rows.length} active room(s) from database`);
}

async function listActiveRooms({ roomType, limit = 30 } = {}) {
  const params = [];
  let sql = `SELECT channel, room_type, host_user_id, host_display_name, viewer_count, status, updated_at
             FROM live_rooms WHERE status = 'active'`;
  if (roomType) {
    params.push(roomType);
    sql += ` AND room_type = $${params.length}`;
  }
  params.push(Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50));
  sql += ` ORDER BY viewer_count DESC, updated_at DESC LIMIT $${params.length}`;
  const res = await db.query(sql, params);
  return res.rows;
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
  recoverActiveRooms,
  listActiveRooms,
  roomCache,
};
