const db = require('../config/database');
const leaderboardService = require('./leaderboardService');
const followService = require('./followService');

function formatScore(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

function buildDisplayName(user) {
  if (!user) return 'Creator';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Creator';
}

async function fetchCreatorRows(userIds) {
  if (!userIds.length) return [];
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.role,
            (SELECT COUNT(*)::int FROM user_follows WHERE following_id = u.id) AS followers,
            (SELECT COALESCE(SUM(gt.creator_amount), 0)::float FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_earnings,
            (SELECT COUNT(*)::int FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_count,
            (SELECT COUNT(*)::int FROM live_rooms lr WHERE lr.host_user_id = u.id) AS live_sessions,
            lr.channel AS live_channel,
            lr.viewer_count AS live_viewers,
            lr.room_type AS live_room_type
     FROM users u
     LEFT JOIN LATERAL (
       SELECT channel, viewer_count, room_type
       FROM live_rooms
       WHERE host_user_id = u.id AND status = 'active'
       ORDER BY viewer_count DESC NULLS LAST, updated_at DESC
       LIMIT 1
     ) lr ON TRUE
     WHERE u.id = ANY($1::uuid[]) AND u.is_active = TRUE`,
    [userIds]
  );
  return res.rows;
}

async function fetchFallbackCreators(limit) {
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.role,
            (SELECT COUNT(*)::int FROM user_follows WHERE following_id = u.id) AS followers,
            COALESCE((SELECT SUM(gt.creator_amount) FROM gift_transactions gt WHERE gt.receiver_id = u.id), 0)::float AS gift_earnings,
            (SELECT COUNT(*)::int FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_count,
            (SELECT COUNT(*)::int FROM live_rooms lr WHERE lr.host_user_id = u.id) AS live_sessions,
            lr.channel AS live_channel,
            lr.viewer_count AS live_viewers,
            lr.room_type AS live_room_type
     FROM users u
     LEFT JOIN LATERAL (
       SELECT channel, viewer_count, room_type
       FROM live_rooms
       WHERE host_user_id = u.id AND status = 'active'
       ORDER BY viewer_count DESC NULLS LAST, updated_at DESC
       LIMIT 1
     ) lr ON TRUE
     WHERE u.is_active = TRUE
       AND (
         u.role IN ('worker', 'host', 'creator', 'coin_seller')
         OR EXISTS (SELECT 1 FROM live_rooms WHERE host_user_id = u.id)
         OR EXISTS (SELECT 1 FROM gift_transactions WHERE receiver_id = u.id)
         OR (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) >= 3
       )
     ORDER BY gift_earnings DESC, followers DESC, u.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

function mapCreatorRow(row, { rank = null, engagementScore = null, viewerId = null, followingSet = null } = {}) {
  const score = engagementScore != null
    ? Number(engagementScore)
    : Math.max(Number(row.gift_earnings || 0), Number(row.followers || 0) * 10);
  const isFollowing = followingSet ? followingSet.has(String(row.id)) : false;
  return {
    id: String(row.id),
    displayName: buildDisplayName(row),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    profilePic: row.profile_pic || null,
    role: row.role || 'customer',
    rank,
    engagementScore: score,
    engagementLabel: formatScore(score),
    followers: Number(row.followers || 0),
    giftCount: Number(row.gift_count || 0),
    giftEarnings: Number(row.gift_earnings || 0),
    liveSessions: Number(row.live_sessions || 0),
    isLive: Boolean(row.live_channel),
    liveChannel: row.live_channel || null,
    liveViewers: Number(row.live_viewers || 0),
    liveRoomType: row.live_room_type || null,
    isFollowing,
    profileHref: `/creator-profile.html?userId=${encodeURIComponent(String(row.id))}&name=${encodeURIComponent(buildDisplayName(row))}&app=1`,
  };
}

async function getFollowingSet(viewerId) {
  if (!viewerId) return null;
  const rows = await followService.getFollowing(viewerId, 500);
  return new Set(rows.map((r) => String(r.id)));
}

async function discoverTopCreators({ period = 'weekly', limit = 30, viewerId = null } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  const lb = await leaderboardService.getLeaderboard(period, 'creators', lim);
  const followingSet = await getFollowingSet(viewerId);

  const scoreById = new Map();
  lb.forEach((row, i) => {
    scoreById.set(String(row.entity_id), { score: Number(row.score || 0), rank: row.rank || i + 1 });
  });

  let orderedIds = lb.map((r) => String(r.entity_id)).filter(Boolean);
  let rows = await fetchCreatorRows(orderedIds);

  if (rows.length < 5) {
    const fallback = await fetchFallbackCreators(lim);
    const seen = new Set(rows.map((r) => String(r.id)));
    for (const row of fallback) {
      if (!seen.has(String(row.id))) {
        rows.push(row);
        orderedIds.push(String(row.id));
        seen.add(String(row.id));
      }
    }
  }

  const rowMap = new Map(rows.map((r) => [String(r.id), r]));
  const creators = [];

  for (const id of orderedIds) {
    const row = rowMap.get(id);
    if (!row) continue;
    const meta = scoreById.get(id);
    creators.push(
      mapCreatorRow(row, {
        rank: meta?.rank || creators.length + 1,
        engagementScore: meta?.score,
        viewerId,
        followingSet,
      })
    );
    if (creators.length >= lim) break;
  }

  if (!creators.length && rows.length) {
    rows.slice(0, lim).forEach((row, i) => {
      creators.push(
        mapCreatorRow(row, {
          rank: i + 1,
          viewerId,
          followingSet,
        })
      );
    });
  }

  return { period, creators };
}

async function getCreatorEngagement(userId, viewerId = null) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const rows = await fetchCreatorRows([id]);
  if (!rows.length) return null;
  const followingSet = await getFollowingSet(viewerId);
  const lb = await leaderboardService.getLeaderboard('weekly', 'creators', 100);
  const lbRow = lb.find((r) => String(r.entity_id) === id);
  return mapCreatorRow(rows[0], {
    rank: lbRow?.rank || null,
    engagementScore: lbRow ? Number(lbRow.score || 0) : null,
    viewerId,
    followingSet,
  });
}

module.exports = {
  discoverTopCreators,
  getCreatorEngagement,
  formatScore,
};
