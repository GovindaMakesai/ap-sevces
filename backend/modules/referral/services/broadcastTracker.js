const db = require('../../../config/database');
const settings = require('./settingsService');
const missionEngine = require('./missionEngine');

/**
 * Broadcast tracker — separate from live socket core.
 * Hosts (or a light poller) report start/end; we also reconcile from live_rooms.
 */
async function startBroadcast(userId, { channel = null, liveRoomId = null } = {}) {
  await db.query(
    `UPDATE broadcast_sessions SET status = 'ended', ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
     WHERE user_id = $1 AND status IN ('active','paused')`,
    [userId]
  );
  const res = await db.query(
    `INSERT INTO broadcast_sessions (user_id, live_room_id, channel, status)
     VALUES ($1,$2,$3,'active') RETURNING *`,
    [userId, liveRoomId, channel]
  );
  return res.rows[0];
}

async function pauseBroadcast(userId) {
  const res = await db.query(
    `UPDATE broadcast_sessions SET status = 'paused'
     WHERE user_id = $1 AND status = 'active'
     RETURNING *`,
    [userId]
  );
  return res.rows[0] || null;
}

async function endBroadcast(userId, { sessionId = null } = {}) {
  const dailyCapHours =
    Number(await settings.getSetting('max_broadcast_hours_counted_per_day', 3)) || 3;
  const dailyCapSec = dailyCapHours * 3600;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let session;
    if (sessionId) {
      const r = await client.query(
        `SELECT * FROM broadcast_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, userId]
      );
      session = r.rows[0];
    } else {
      const r = await client.query(
        `SELECT * FROM broadcast_sessions
         WHERE user_id = $1 AND status IN ('active','paused')
         ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
        [userId]
      );
      session = r.rows[0];
    }
    if (!session) {
      await client.query('ROLLBACK');
      return null;
    }

    const endedAt = new Date();
    const startedAt = new Date(session.started_at);
    const duration = Math.max(0, Math.floor((endedAt - startedAt) / 1000) - Number(session.pause_seconds || 0));

    const day = endedAt.toISOString().slice(0, 10);
    const summary = await client.query(
      `INSERT INTO broadcast_summary (user_id, day, total_seconds, counted_seconds, sessions)
       VALUES ($1,$2::date,0,0,0)
       ON CONFLICT (user_id, day) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [userId, day]
    );
    const alreadyCounted = Number(summary.rows[0]?.counted_seconds || 0);
    const roomLeft = Math.max(0, dailyCapSec - alreadyCounted);
    const counted = Math.min(duration, roomLeft);

    await client.query(
      `UPDATE broadcast_sessions SET
         ended_at = $2, duration_seconds = $3, counted_seconds = $4, status = 'ended'
       WHERE id = $1`,
      [session.id, endedAt, duration, counted]
    );
    await client.query(
      `UPDATE broadcast_summary SET
         total_seconds = total_seconds + $3,
         counted_seconds = counted_seconds + $4,
         sessions = sessions + 1
       WHERE user_id = $1 AND day = $2::date`,
      [userId, day, duration, counted]
    );
    await client.query(
      `INSERT INTO host_statistics (user_id, lifetime_broadcast_seconds, updated_at)
       VALUES ($1,$2,CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         lifetime_broadcast_seconds = host_statistics.lifetime_broadcast_seconds + EXCLUDED.lifetime_broadcast_seconds,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, counted]
    );
    await client.query('COMMIT');

    /* Side-effect: refresh missions (isolated) */
    try {
      await missionEngine.syncUserMissions(userId);
    } catch (_e) {}

    return { sessionId: session.id, duration_seconds: duration, counted_seconds: counted };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Recover from live_rooms without touching live module internals.
 * Reads ended/active rooms and materializes sessions if missing.
 */
async function reconcileFromLiveRooms(userId) {
  const rooms = await db.query(
    `SELECT id, channel, started_at, ended_at, status
     FROM live_rooms
     WHERE host_user_id = $1
       AND started_at > NOW() - INTERVAL '7 days'
     ORDER BY started_at DESC
     LIMIT 20`,
    [userId]
  ).catch(() => ({ rows: [] }));

  for (const room of rooms.rows) {
    if (room.status === 'active' || !room.ended_at) continue;
    const exists = await db.query(
      `SELECT 1 FROM broadcast_sessions WHERE live_room_id = $1 LIMIT 1`,
      [room.id]
    );
    if (exists.rows.length) continue;
    await db.query(
      `INSERT INTO broadcast_sessions
         (user_id, live_room_id, channel, started_at, ended_at, duration_seconds, counted_seconds, status, metadata)
       VALUES ($1,$2,$3,$4,$5,0,0,'recovered',$6)`,
      [
        userId,
        room.id,
        room.channel,
        room.started_at,
        room.ended_at,
        JSON.stringify({ recovered: true }),
      ]
    );
    /* Count via endBroadcast path */
    const sess = await db.query(
      `SELECT id FROM broadcast_sessions WHERE live_room_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [room.id]
    );
    if (sess.rows[0]) {
      await db.query(
        `UPDATE broadcast_sessions SET status = 'active' WHERE id = $1`,
        [sess.rows[0].id]
      );
      await endBroadcast(userId, { sessionId: sess.rows[0].id });
    }
  }
}

async function getStatistics(userId) {
  await reconcileFromLiveRooms(userId).catch(() => {});
  const stats = await db.query(`SELECT * FROM host_statistics WHERE user_id = $1`, [userId]);
  const today = await db.query(
    `SELECT * FROM broadcast_summary WHERE user_id = $1 AND day = CURRENT_DATE`,
    [userId]
  );
  const week = await db.query(
    `SELECT COALESCE(SUM(counted_seconds),0)::bigint AS sec
     FROM broadcast_summary
     WHERE user_id = $1 AND day >= CURRENT_DATE - INTERVAL '7 days'`,
    [userId]
  );
  const month = await db.query(
    `SELECT COALESCE(SUM(counted_seconds),0)::bigint AS sec
     FROM broadcast_summary
     WHERE user_id = $1 AND day >= date_trunc('month', CURRENT_DATE)::date`,
    [userId]
  );
  const active = await db.query(
    `SELECT * FROM broadcast_sessions WHERE user_id = $1 AND status IN ('active','paused')
     ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );
  return {
    host: stats.rows[0] || null,
    today: today.rows[0] || { total_seconds: 0, counted_seconds: 0, sessions: 0 },
    weekly_counted_seconds: Number(week.rows[0]?.sec || 0),
    monthly_counted_seconds: Number(month.rows[0]?.sec || 0),
    activeSession: active.rows[0] || null,
    dailyCapHours: Number(await settings.getSetting('max_broadcast_hours_counted_per_day', 3)) || 3,
  };
}

module.exports = {
  startBroadcast,
  pauseBroadcast,
  endBroadcast,
  reconcileFromLiveRooms,
  getStatistics,
};
