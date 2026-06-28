const db = require('../config/database');

const HEARTBEAT_SECONDS = 25;

function sessionSecondsFromRow(row) {
  if (!row) return 0;
  const broadcast = Number(row.broadcast_seconds) || 0;
  let elapsed = 0;
  const endTs = row.ended_at || (row.status === 'ended' ? row.updated_at : null);
  if (row.started_at && endTs) {
    const ms = new Date(endTs).getTime() - new Date(row.started_at).getTime();
    elapsed = Math.max(0, Math.floor(ms / 1000));
  } else if (row.started_at && row.status === 'active') {
    const ms = Date.now() - new Date(row.started_at).getTime();
    elapsed = Math.max(0, Math.floor(ms / 1000));
  }
  return Math.max(broadcast, elapsed);
}

function periodStart(period) {
  const now = new Date();
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'month') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

async function recordSessionEnd(room) {
  if (!room?.host_user_id) return;
  const seconds = sessionSecondsFromRow({ ...room, status: 'ended' });
  if (seconds < 1) return;

  const endedAt = room.ended_at ? new Date(room.ended_at) : new Date();
  const statDate = endedAt.toISOString().slice(0, 10);
  const isParty = String(room.room_type || '') === 'party';
  const liveAdd = isParty ? 0 : seconds;
  const partyAdd = isParty ? seconds : 0;
  const peak = Number(room.peak_viewer_count || room.viewer_count || 0);

  await db.query(
    `INSERT INTO live_host_stat_daily (host_user_id, stat_date, live_seconds, party_seconds, peak_viewers, session_count)
     VALUES ($1, $2::date, $3, $4, $5, 1)
     ON CONFLICT (host_user_id, stat_date) DO UPDATE SET
       live_seconds = live_host_stat_daily.live_seconds + EXCLUDED.live_seconds,
       party_seconds = live_host_stat_daily.party_seconds + EXCLUDED.party_seconds,
       peak_viewers = GREATEST(live_host_stat_daily.peak_viewers, EXCLUDED.peak_viewers),
       session_count = live_host_stat_daily.session_count + 1`,
    [room.host_user_id, statDate, liveAdd, partyAdd, peak]
  );
}

async function accumulateHostHeartbeat(room, userId, seconds = HEARTBEAT_SECONDS) {
  if (!room?.id || !userId) return;
  if (String(room.host_user_id) !== String(userId)) return;
  if (room.status !== 'active') return;

  await db.query(
    `UPDATE live_rooms
     SET broadcast_seconds = COALESCE(broadcast_seconds, 0) + $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [room.id, Math.max(1, Number(seconds) || HEARTBEAT_SECONDS)]
  );
}

async function backfillHostStatsFromRooms(userId) {
  const res = await db.query(
    `SELECT id, host_user_id, room_type, status, broadcast_seconds, started_at, ended_at, updated_at,
            peak_viewer_count, viewer_count
     FROM live_rooms
     WHERE host_user_id = $1
       AND (
         status = 'ended'
         OR (status = 'active' AND started_at IS NOT NULL)
       )
       AND started_at IS NOT NULL
       AND COALESCE(ended_at, updated_at) >= CURRENT_TIMESTAMP - INTERVAL '90 days'`,
    [userId]
  );
  for (const row of res.rows) {
    const seconds = sessionSecondsFromRow(row);
    if (seconds < 1) continue;
    const endedAt = row.ended_at ? new Date(row.ended_at) : new Date(row.updated_at || Date.now());
    const statDate = endedAt.toISOString().slice(0, 10);
    const isParty = String(row.room_type || '') === 'party';
    await db.query(
      `INSERT INTO live_host_stat_daily (host_user_id, stat_date, live_seconds, party_seconds, peak_viewers, session_count)
       VALUES ($1, $2::date, $3, $4, $5, 0)
       ON CONFLICT (host_user_id, stat_date) DO UPDATE SET
         live_seconds = GREATEST(live_host_stat_daily.live_seconds, EXCLUDED.live_seconds),
         party_seconds = GREATEST(live_host_stat_daily.party_seconds, EXCLUDED.party_seconds),
         peak_viewers = GREATEST(live_host_stat_daily.peak_viewers, EXCLUDED.peak_viewers)`,
      [
        userId,
        statDate,
        isParty ? 0 : seconds,
        isParty ? seconds : 0,
        Number(row.peak_viewer_count || row.viewer_count || 0),
      ]
    );
  }
  return res.rows.length;
}

const _backfillAt = new Map();
const BACKFILL_COOLDOWN_MS = 5 * 60 * 1000;

async function getStreamerStats(userId, period = 'today') {
  const lastBackfill = _backfillAt.get(String(userId)) || 0;
  if (Date.now() - lastBackfill > BACKFILL_COOLDOWN_MS) {
    _backfillAt.set(String(userId), Date.now());
    backfillHostStatsFromRooms(userId).catch(() => {});
  }
  const since = periodStart(period);

  const roomsRes = await db.query(
    `SELECT id, room_type, status, broadcast_seconds, started_at, ended_at,
            peak_viewer_count, viewer_count, updated_at
     FROM live_rooms
     WHERE host_user_id = $1
       AND (
         (status = 'ended' AND COALESCE(ended_at, updated_at) >= $2)
         OR status = 'active'
       )`,
    [userId, since]
  );

  let liveSeconds = 0;
  let partySeconds = 0;
  let peakViewers = 0;
  let sessionCount = 0;

  for (const row of roomsRes.rows) {
    const sec = sessionSecondsFromRow(row);
    if (String(row.room_type) === 'party') partySeconds += sec;
    else liveSeconds += sec;
    peakViewers = Math.max(peakViewers, Number(row.peak_viewer_count || row.viewer_count || 0));
    if (row.status === 'ended') sessionCount += 1;
  }

  const giftsRes = await db.query(
    `SELECT COALESCE(SUM(creator_amount), 0)::bigint AS coins
     FROM gift_transactions
     WHERE receiver_id = $1 AND created_at >= $2`,
    [userId, since]
  );

  const followsRes = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM user_follows
     WHERE following_id = $1 AND created_at >= $2`,
    [userId, since]
  );

  const lastRes = await db.query(
    `SELECT room_type, broadcast_seconds, started_at, ended_at, peak_viewer_count, viewer_count
     FROM live_rooms
     WHERE host_user_id = $1 AND status = 'ended'
     ORDER BY ended_at DESC NULLS LAST
     LIMIT 1`,
    [userId]
  );
  const last = lastRes.rows[0] || null;
  const lastSeconds = sessionSecondsFromRow(last);
  const lastPeak = last ? Number(last.peak_viewer_count || last.viewer_count || 0) : 0;

  const totalSeconds = liveSeconds + partySeconds;
  const avgViewers =
    peakViewers > 0
      ? peakViewers
      : roomsRes.rows.length
        ? Math.round(
            roomsRes.rows.reduce((sum, r) => sum + Number(r.viewer_count || 0), 0) /
              Math.max(1, roomsRes.rows.length)
          )
        : 0;

  return {
    period,
    liveSeconds,
    partySeconds,
    totalSeconds,
    totalFormatted: formatDuration(totalSeconds),
    giftCoins: Number(giftsRes.rows[0]?.coins || 0),
    newFollowers: Number(followsRes.rows[0]?.c || 0),
    peakViewers,
    avgViewers,
    sessionCount,
    lastSession: last
      ? {
          seconds: lastSeconds,
          formatted: formatDuration(lastSeconds),
          peakViewers: lastPeak,
          roomType: last.room_type,
        }
      : null,
  };
}

module.exports = {
  HEARTBEAT_SECONDS,
  formatDuration,
  recordSessionEnd,
  accumulateHostHeartbeat,
  getStreamerStats,
  backfillHostStatsFromRooms,
};
