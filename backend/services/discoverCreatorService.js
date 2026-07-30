const db = require('../config/database');
const leaderboardService = require('./leaderboardService');
const followService = require('./followService');
const socialFeedService = require('./socialFeedService');

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

/** Active live as host OR on a party/live seat */
const LIVE_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT lr.channel, lr.viewer_count, lr.room_type
    FROM live_rooms lr
    WHERE lr.status = 'active'
      AND (
        lr.host_user_id = u.id
        OR EXISTS (
          SELECT 1 FROM live_room_members m
          WHERE m.live_room_id = lr.id
            AND m.user_id = u.id
            AND m.left_at IS NULL
            AND (m.seat_index IS NOT NULL OR m.role IN ('host', 'speaker'))
        )
      )
    ORDER BY CASE WHEN lr.host_user_id = u.id THEN 0 ELSE 1 END,
             lr.viewer_count DESC NULLS LAST,
             lr.updated_at DESC
    LIMIT 1
  ) lr ON TRUE
`;

const AGENCY_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT a.id AS agency_id, a.name AS agency_name
    FROM host_profiles hp
    JOIN agencies a ON a.id = hp.agency_id AND a.status = 'active'
    WHERE hp.user_id = u.id AND COALESCE(hp.status, 'active') = 'active'
    LIMIT 1
  ) ag ON TRUE
`;

async function fetchCreatorRows(userIds) {
  if (!userIds.length) return [];
  try {
    const res = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.role, u.display_id, u.updated_at,
              u.is_verified, u.bio, u.social_links, u.featured_post_id,
              (SELECT COUNT(*)::int FROM user_follows WHERE following_id = u.id) AS followers,
              (SELECT COUNT(*)::int FROM user_follows WHERE follower_id = u.id) AS following,
              (SELECT COALESCE(SUM(gt.creator_amount), 0)::float FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_earnings,
              (SELECT COUNT(*)::int FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_count,
              (SELECT COUNT(*)::int FROM live_rooms lr WHERE lr.host_user_id = u.id) AS live_sessions,
              lr.channel AS live_channel,
              lr.viewer_count AS live_viewers,
              lr.room_type AS live_room_type,
              ag.agency_id,
              ag.agency_name,
              vl.name AS vip_level_name,
              vl.level AS vip_level_rank,
              cb.badge_type AS creator_badge_type,
              cb.crown_type AS creator_crown_type
       FROM users u
       ${LIVE_LATERAL}
       ${AGENCY_LATERAL}
       LEFT JOIN vip_memberships vm ON vm.user_id = u.id
       LEFT JOIN vip_levels vl ON vl.id = vm.vip_level_id
       LEFT JOIN LATERAL (
         SELECT badge_type, crown_type FROM creator_badges
         WHERE user_id = u.id ORDER BY granted_at DESC NULLS LAST LIMIT 1
       ) cb ON TRUE
       WHERE u.id = ANY($1::uuid[]) AND u.is_active = TRUE`,
      [userIds]
    );
    return res.rows;
  } catch (e) {
    console.warn('fetchCreatorRows enriched failed, fallback:', e.message);
    const res = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.role, u.display_id, u.updated_at,
              (SELECT COUNT(*)::int FROM user_follows WHERE following_id = u.id) AS followers,
              (SELECT COUNT(*)::int FROM user_follows WHERE follower_id = u.id) AS following,
              (SELECT COALESCE(SUM(gt.creator_amount), 0)::float FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_earnings,
              (SELECT COUNT(*)::int FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_count,
              (SELECT COUNT(*)::int FROM live_rooms lr WHERE lr.host_user_id = u.id) AS live_sessions,
              lr.channel AS live_channel,
              lr.viewer_count AS live_viewers,
              lr.room_type AS live_room_type,
              ag.agency_id,
              ag.agency_name
       FROM users u
       ${LIVE_LATERAL}
       ${AGENCY_LATERAL}
       WHERE u.id = ANY($1::uuid[]) AND u.is_active = TRUE`,
      [userIds]
    );
    return res.rows;
  }
}

async function fetchFallbackCreators(limit, hiddenIds = []) {
  const params = [limit];
  let hiddenClause = '';
  if (hiddenIds.length) {
    params.push(hiddenIds);
    hiddenClause = `AND NOT (u.id = ANY($${params.length}::uuid[]))`;
  }
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.role, u.display_id, u.updated_at,
            (SELECT COUNT(*)::int FROM user_follows WHERE following_id = u.id) AS followers,
            (SELECT COUNT(*)::int FROM user_follows WHERE follower_id = u.id) AS following,
            COALESCE((SELECT SUM(gt.creator_amount) FROM gift_transactions gt WHERE gt.receiver_id = u.id), 0)::float AS gift_earnings,
            (SELECT COUNT(*)::int FROM gift_transactions gt WHERE gt.receiver_id = u.id) AS gift_count,
            (SELECT COUNT(*)::int FROM live_rooms lr WHERE lr.host_user_id = u.id) AS live_sessions,
            lr.channel AS live_channel,
            lr.viewer_count AS live_viewers,
            lr.room_type AS live_room_type,
            ag.agency_id,
            ag.agency_name
     FROM users u
     ${LIVE_LATERAL}
     ${AGENCY_LATERAL}
     WHERE u.is_active = TRUE
       ${hiddenClause}
       AND (
         u.role IN ('worker', 'host', 'creator', 'coin_seller')
         OR EXISTS (SELECT 1 FROM live_rooms WHERE host_user_id = u.id)
         OR EXISTS (SELECT 1 FROM gift_transactions WHERE receiver_id = u.id)
         OR (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) >= 3
       )
     ORDER BY gift_earnings DESC, followers DESC, u.created_at DESC
     LIMIT $1`,
    params
  );
  return res.rows;
}

function mapCreatorRow(row, { rank = null, engagementScore = null, viewerId = null, followingSet = null } = {}) {
  const score = engagementScore != null
    ? Number(engagementScore)
    : Math.max(Number(row.gift_earnings || 0), Number(row.followers || 0) * 10);
  const isFollowing = followingSet ? followingSet.has(String(row.id)) : false;
  const liveRoomType = row.live_room_type || null;
  let socialLinks = row.social_links || {};
  if (typeof socialLinks === 'string') {
    try {
      socialLinks = JSON.parse(socialLinks);
    } catch (_e) {
      socialLinks = {};
    }
  }
  return {
    id: String(row.id),
    displayId: row.display_id != null ? String(row.display_id) : null,
    displayName: buildDisplayName(row),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    profilePic: row.profile_pic || null,
    profileUpdatedAt: row.updated_at || null,
    role: row.role || 'customer',
    isVerified: Boolean(row.is_verified),
    bio: row.bio || null,
    socialLinks,
    vipLevel: row.vip_level_name || null,
    vipLevelRank: row.vip_level_rank != null ? Number(row.vip_level_rank) : null,
    creatorBadge: row.creator_badge_type || null,
    creatorCrown: row.creator_crown_type || null,
    /* Plug-in slot if a dedicated creator level ships later */
    creatorLevel: row.vip_level_name || row.creator_badge_type || null,
    rank,
    engagementScore: score,
    engagementLabel: formatScore(score),
    followers: Number(row.followers || 0),
    following: Number(row.following || 0),
    giftCount: Number(row.gift_count || 0),
    giftEarnings: Number(row.gift_earnings || 0),
    liveSessions: Number(row.live_sessions || 0),
    isLive: Boolean(row.live_channel),
    liveChannel: row.live_channel || null,
    liveViewers: Number(row.live_viewers || 0),
    liveRoomType,
    liveHref: row.live_channel
      ? `/${liveRoomType === 'party' ? 'party-room' : 'live-room'}.html?channel=${encodeURIComponent(row.live_channel)}&app=1`
      : null,
    agencyId: row.agency_id ? String(row.agency_id) : null,
    agencyName: row.agency_name || null,
    isFollowing,
    postsCount: Number(row.posts_count || 0),
    videosCount: Number(row.videos_count || 0),
    featuredPostId: row.featured_post_id ? String(row.featured_post_id) : null,
    profileHref: `/creator-profile.html?userId=${encodeURIComponent(String(row.id))}&name=${encodeURIComponent(buildDisplayName(row))}&app=1`,
  };
}

async function getFollowingSet(viewerId) {
  if (!viewerId) return null;
  const rows = await followService.getFollowing(viewerId, 500);
  return new Set(rows.map((r) => String(r.id)));
}

async function applyBlockFilter(creators, viewerId) {
  if (!viewerId || !creators?.length) return creators || [];
  const hidden = await followService.getHiddenUserIdSet(viewerId);
  if (!hidden.size) return creators;
  return creators.filter((c) => !hidden.has(String(c.id)));
}

async function discoverTopCreators({ period = 'weekly', limit = 30, viewerId = null } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  let followingSet = null;
  let hiddenIds = [];
  try {
    followingSet = await getFollowingSet(viewerId);
  } catch (e) {
    console.warn('discoverTopCreators following skip:', e.message);
  }
  try {
    if (viewerId) {
      const hidden = await followService.getHiddenUserIdSet(viewerId);
      hiddenIds = [...hidden];
    }
  } catch (_e) {
    hiddenIds = [];
  }

  const [lbSettled, fallbackSettled] = await Promise.allSettled([
    Promise.race([
      leaderboardService.getLeaderboard(period, 'creators', lim),
      new Promise((resolve) => setTimeout(() => resolve([]), 3500)),
    ]),
    fetchFallbackCreators(lim * 2, hiddenIds),
  ]);

  const lb = lbSettled.status === 'fulfilled' ? lbSettled.value : [];
  let rows = fallbackSettled.status === 'fulfilled' ? fallbackSettled.value : [];

  const scoreById = new Map();
  lb.forEach((row, i) => {
    scoreById.set(String(row.entity_id), { score: Number(row.score || 0), rank: row.rank || i + 1 });
  });

  let orderedIds = lb
    .map((r) => String(r.entity_id))
    .filter((id) => id && !hiddenIds.includes(id));
  const rowMap = new Map(rows.map((r) => [String(r.id), r]));

  if (orderedIds.length) {
    try {
      const rankedRows = await fetchCreatorRows(orderedIds);
      rankedRows.forEach((row) => {
        const id = String(row.id);
        rowMap.set(id, row);
        if (!rows.some((r) => String(r.id) === id)) rows.push(row);
      });
    } catch (e) {
      console.warn('discoverTopCreators fetchCreatorRows skip:', e.message);
    }
  }

  if (!orderedIds.length && rows.length) {
    orderedIds = rows.map((r) => String(r.id));
  }
  const creators = [];

  for (const id of orderedIds) {
    if (hiddenIds.includes(id)) continue;
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
      if (hiddenIds.includes(String(row.id))) return;
      creators.push(
        mapCreatorRow(row, {
          rank: i + 1,
          viewerId,
          followingSet,
        })
      );
    });
  }

  return { period, creators: await applyBlockFilter(creators, viewerId) };
}

async function discoverCreatorsFast({ limit = 30, viewerId = null } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  let followingSet = null;
  let hiddenIds = [];
  try {
    followingSet = await getFollowingSet(viewerId);
  } catch (_e) {
    followingSet = null;
  }
  try {
    if (viewerId) {
      const hidden = await followService.getHiddenUserIdSet(viewerId);
      hiddenIds = [...hidden];
    }
  } catch (_e) {
    hiddenIds = [];
  }
  const rows = await fetchFallbackCreators(lim, hiddenIds);
  const creators = rows.map((row, i) =>
    mapCreatorRow(row, { rank: i + 1, viewerId, followingSet })
  );
  return { period: 'weekly', creators: await applyBlockFilter(creators, viewerId) };
}

async function getCreatorEngagement(userId, viewerId = null) {
  const id = String(userId || '').trim();
  if (!id) return null;

  if (viewerId) {
    const blocked = await followService.areBlockedEitherWay(viewerId, id);
    if (blocked) return null;
  }

  const rows = await fetchCreatorRows([id]);
  if (!rows.length) return null;
  const followingSet = await getFollowingSet(viewerId);
  const lb = await leaderboardService.getLeaderboard('weekly', 'creators', 100);
  const lbRow = lb.find((r) => String(r.entity_id) === id);
  const stats = await followService.getStats(id);
  const counts = await socialFeedService.getCreatorPostCounts(id, viewerId);
  const mapped = mapCreatorRow(
    { ...rows[0], posts_count: counts.posts_count, videos_count: counts.videos_count },
    {
      rank: lbRow?.rank || null,
      engagementScore: lbRow ? Number(lbRow.score || 0) : null,
      viewerId,
      followingSet,
    }
  );

  let featuredVideo = null;
  try {
    const discovery = require('./creatorDiscoveryService');
    const fv = await discovery.getFeaturedVideo(id);
    if (fv) {
      featuredVideo = {
        id: fv.id,
        mediaUrl: fv.media_url,
        thumbUrl: fv.thumb_url,
        caption: fv.body || '',
        likes: fv.like_count || 0,
        comments: fv.comment_count || 0,
        source: fv.featured_source || 'auto',
        href: `/video.html?post=${encodeURIComponent(fv.id)}&app=1&fullscreen=1`,
      };
    }
  } catch (_e) {
    featuredVideo = null;
  }

  /* Lifetime live hours from host stats when available */
  let liveHoursTotal = null;
  try {
    const hrs = await db.query(
      `SELECT COALESCE(SUM(live_seconds + party_seconds), 0)::float / 3600.0 AS hours
       FROM live_host_stat_daily WHERE host_user_id = $1`,
      [id]
    );
    liveHoursTotal = Math.round(Number(hrs.rows[0]?.hours || 0) * 10) / 10;
  } catch (_e) {
    liveHoursTotal = null;
  }

  return {
    ...mapped,
    followers: Number(stats.followers) || mapped.followers,
    following: Number(stats.following) || mapped.following,
    postsCount: counts.posts_count,
    videosCount: counts.videos_count,
    featuredVideo,
    liveHoursTotal,
  };
}

/**
 * Batch live status for feed author pills.
 * Returns Map userId -> { channel, roomType, viewers, href }
 */
async function getLiveStatusForUsers(userIds) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const res = await db.query(
    `SELECT u.id,
            lr.channel AS live_channel,
            lr.viewer_count AS live_viewers,
            lr.room_type AS live_room_type
     FROM users u
     ${LIVE_LATERAL}
     WHERE u.id = ANY($1::uuid[])`,
    [ids]
  );
  const map = new Map();
  res.rows.forEach((row) => {
    if (!row.live_channel) return;
    const roomType = row.live_room_type || 'live';
    map.set(String(row.id), {
      channel: row.live_channel,
      roomType,
      viewers: Number(row.live_viewers || 0),
      href: `/${roomType === 'party' ? 'party-room' : 'live-room'}.html?channel=${encodeURIComponent(row.live_channel)}&app=1`,
    });
  });
  return map;
}

module.exports = {
  discoverTopCreators,
  discoverCreatorsFast,
  getCreatorEngagement,
  getLiveStatusForUsers,
  formatScore,
};
