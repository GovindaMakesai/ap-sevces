const db = require('../config/database');
const { getStreamerStats, formatDuration, HEARTBEAT_SECONDS } = require('./liveHostStatsService');

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

async function upsertDailyStats(userId, statDate, patch) {
  const liveWatch = Number(patch.live_watch_seconds) || 0;
  const partyWatch = Number(patch.party_watch_seconds) || 0;
  const liveHost = Number(patch.live_host_seconds) || 0;
  const partyHost = Number(patch.party_host_seconds) || 0;
  const giftsSent = Number(patch.gifts_sent_coins) || 0;
  const giftsRecv = Number(patch.gifts_received_coins) || 0;
  const roomsJoined = Number(patch.rooms_joined) || 0;

  await db.query(
    `INSERT INTO live_user_stat_daily (
       user_id, stat_date, live_watch_seconds, party_watch_seconds,
       live_host_seconds, party_host_seconds, gifts_sent_coins, gifts_received_coins, rooms_joined
     ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, stat_date) DO UPDATE SET
       live_watch_seconds = live_user_stat_daily.live_watch_seconds + EXCLUDED.live_watch_seconds,
       party_watch_seconds = live_user_stat_daily.party_watch_seconds + EXCLUDED.party_watch_seconds,
       live_host_seconds = live_user_stat_daily.live_host_seconds + EXCLUDED.live_host_seconds,
       party_host_seconds = live_user_stat_daily.party_host_seconds + EXCLUDED.party_host_seconds,
       gifts_sent_coins = live_user_stat_daily.gifts_sent_coins + EXCLUDED.gifts_sent_coins,
       gifts_received_coins = live_user_stat_daily.gifts_received_coins + EXCLUDED.gifts_received_coins,
       rooms_joined = live_user_stat_daily.rooms_joined + EXCLUDED.rooms_joined`,
    [userId, statDate, liveWatch, partyWatch, liveHost, partyHost, giftsSent, giftsRecv, roomsJoined]
  );
}

async function accumulateMemberWatchTime(room, userId, seconds = HEARTBEAT_SECONDS) {
  if (!room?.id || !userId) return;
  const sec = Math.max(1, Number(seconds) || HEARTBEAT_SECONDS);
  await db.query(
    `UPDATE live_room_members
     SET active_seconds = COALESCE(active_seconds, 0) + $3,
         last_seen_at = CURRENT_TIMESTAMP
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [room.id, userId, sec]
  );
}

async function recordRoomJoin(userId, roomType) {
  const statDate = new Date().toISOString().slice(0, 10);
  await upsertDailyStats(userId, statDate, { rooms_joined: 1 });
}

async function flushMemberSessionStats(room, userId) {
  if (!room?.id || !userId) return;

  const memberRes = await db.query(
    `SELECT role, active_seconds
     FROM live_room_members
     WHERE live_room_id = $1 AND user_id = $2
     ORDER BY joined_at DESC
     LIMIT 1`,
    [room.id, userId]
  );
  const member = memberRes.rows[0];
  if (!member) return;

  const seconds = Math.max(0, Number(member.active_seconds) || 0);
  if (seconds < 1) return;

  const isHost = String(room.host_user_id) === String(userId);
  const isParty = String(room.room_type || '') === 'party';
  const statDate = new Date().toISOString().slice(0, 10);
  const patch = isHost
    ? isParty
      ? { party_host_seconds: seconds }
      : { live_host_seconds: seconds }
    : isParty
      ? { party_watch_seconds: seconds }
      : { live_watch_seconds: seconds };

  await upsertDailyStats(userId, statDate, patch);

  await db.query(
    `UPDATE live_room_members SET active_seconds = 0
     WHERE live_room_id = $1 AND user_id = $2 AND left_at IS NOT NULL`,
    [room.id, userId]
  );
}

async function recordGiftStats(senderId, receiverId, coinAmount, creatorAmount) {
  const statDate = new Date().toISOString().slice(0, 10);
  const sent = Number(coinAmount) || 0;
  const received = Number(creatorAmount) || 0;
  if (sent > 0) await upsertDailyStats(senderId, statDate, { gifts_sent_coins: sent });
  if (received > 0) await upsertDailyStats(receiverId, statDate, { gifts_received_coins: received });
}

async function getUserAnalytics(userId, period = 'today') {
  const since = periodStart(period);
  const hostStats = await getStreamerStats(userId, period);

  const dailyRes = await db.query(
    `SELECT
       COALESCE(SUM(live_watch_seconds), 0)::bigint AS live_watch_seconds,
       COALESCE(SUM(party_watch_seconds), 0)::bigint AS party_watch_seconds,
       COALESCE(SUM(live_host_seconds), 0)::bigint AS live_host_seconds,
       COALESCE(SUM(party_host_seconds), 0)::bigint AS party_host_seconds,
       COALESCE(SUM(gifts_sent_coins), 0)::bigint AS gifts_sent_coins,
       COALESCE(SUM(gifts_received_coins), 0)::bigint AS gifts_received_coins,
       COALESCE(SUM(rooms_joined), 0)::int AS rooms_joined
     FROM live_user_stat_daily
     WHERE user_id = $1 AND stat_date >= $2::date`,
    [userId, since]
  );
  const daily = dailyRes.rows[0] || {};

  const giftsSentRes = await db.query(
    `SELECT COALESCE(SUM(coin_amount), 0)::bigint AS coins, COUNT(*)::int AS count
     FROM gift_transactions WHERE sender_id = $1 AND created_at >= $2`,
    [userId, since]
  );
  const giftsRecvRes = await db.query(
    `SELECT COALESCE(SUM(creator_amount), 0)::bigint AS coins, COUNT(*)::int AS count
     FROM gift_transactions WHERE receiver_id = $1 AND created_at >= $2`,
    [userId, since]
  );

  const sessionsRes = await db.query(
    `SELECT COUNT(DISTINCT live_room_id)::int AS sessions
     FROM live_room_members
     WHERE user_id = $1 AND joined_at >= $2`,
    [userId, since]
  );

  const liveWatchSeconds = Number(daily.live_watch_seconds) || 0;
  const partyWatchSeconds = Number(daily.party_watch_seconds) || 0;
  const liveHostSeconds = Math.max(Number(daily.live_host_seconds) || 0, Number(hostStats.liveSeconds) || 0);
  const partyHostSeconds = Math.max(Number(daily.party_host_seconds) || 0, Number(hostStats.partySeconds) || 0);
  const totalWatchSeconds = liveWatchSeconds + partyWatchSeconds;
  const totalHostSeconds = liveHostSeconds + partyHostSeconds;
  const totalSeconds = totalWatchSeconds + totalHostSeconds;

  return {
    period,
    liveWatchSeconds,
    partyWatchSeconds,
    liveHostSeconds,
    partyHostSeconds,
    totalWatchSeconds,
    totalHostSeconds,
    totalSeconds,
    totalWatchFormatted: formatDuration(totalWatchSeconds),
    totalHostFormatted: formatDuration(totalHostSeconds),
    totalFormatted: formatDuration(totalSeconds),
    giftsSentCoins: Number(giftsSentRes.rows[0]?.coins || daily.gifts_sent_coins || 0),
    giftsSentCount: Number(giftsSentRes.rows[0]?.count || 0),
    giftsReceivedCoins: Number(giftsRecvRes.rows[0]?.coins || daily.gifts_received_coins || 0),
    giftsReceivedCount: Number(giftsRecvRes.rows[0]?.count || 0),
    roomsJoined: Math.max(Number(daily.rooms_joined) || 0, Number(sessionsRes.rows[0]?.sessions) || 0),
    host: {
      giftCoins: Number(hostStats.giftCoins) || 0,
      newFollowers: Number(hostStats.newFollowers) || 0,
      peakViewers: Number(hostStats.peakViewers) || 0,
      sessionCount: Number(hostStats.sessionCount) || 0,
      lastSession: hostStats.lastSession,
    },
  };
}

module.exports = {
  HEARTBEAT_SECONDS,
  accumulateMemberWatchTime,
  recordRoomJoin,
  flushMemberSessionStats,
  recordGiftStats,
  getUserAnalytics,
  upsertDailyStats,
};
