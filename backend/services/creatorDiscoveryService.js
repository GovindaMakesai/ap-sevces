const db = require('../config/database');
const followService = require('./followService');
const RANKING = require('../config/socialFeedRanking');

/**
 * Lightweight discovery rails for Video/Square.
 * Sections: live | trending | new_creators | because_you_follow
 */
async function getDiscoveryRails(viewerId, { limit = 12 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 24);
  let hidden = [];
  try {
    if (viewerId) {
      const set = await followService.getHiddenUserIdSet(viewerId);
      hidden = [...set];
    }
  } catch (_e) {
    hidden = [];
  }

  const [live, trending, neu, because] = await Promise.all([
    sectionLiveNow(lim, hidden),
    sectionTrending(lim, hidden),
    sectionNewCreators(lim, hidden),
    viewerId ? sectionBecauseYouFollow(viewerId, lim, hidden) : Promise.resolve([]),
  ]);

  return {
    sections: [
      { id: 'live_now', title: 'Live Now', items: live },
      { id: 'trending', title: 'Trending', items: trending },
      { id: 'new_creators', title: 'New Creators', items: neu },
      { id: 'because_you_follow', title: 'Because You Follow', items: because },
    ].filter((s) => s.items.length > 0 || s.id === 'live_now'),
  };
}

function mapLiveRow(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Creator';
  const roomType = row.room_type || 'live';
  return {
    type: 'live',
    userId: String(row.user_id || row.id),
    displayName: name,
    profilePic: row.profile_pic || null,
    channel: row.channel,
    viewers: Number(row.viewer_count || 0),
    roomType,
    href: `/${roomType === 'party' ? 'party-room' : 'live-room'}.html?channel=${encodeURIComponent(row.channel)}&app=1`,
    profileHref: `/creator-profile.html?userId=${encodeURIComponent(String(row.user_id || row.id))}&name=${encodeURIComponent(name)}&app=1`,
  };
}

function mapCreatorCard(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Creator';
  return {
    type: 'creator',
    userId: String(row.id),
    displayName: name,
    profilePic: row.profile_pic || null,
    role: row.role || null,
    agencyName: row.agency_name || null,
    isVerified: Boolean(row.is_verified),
    vipLevel: row.vip_level_name || null,
    followers: Number(row.followers || 0),
    isLive: Boolean(row.live_channel),
    liveHref: row.live_channel
      ? `/${row.live_room_type === 'party' ? 'party-room' : 'live-room'}.html?channel=${encodeURIComponent(row.live_channel)}&app=1`
      : null,
    profileHref: `/creator-profile.html?userId=${encodeURIComponent(String(row.id))}&name=${encodeURIComponent(name)}&app=1`,
  };
}

function mapPostCard(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Creator';
  return {
    type: 'post',
    postId: String(row.id),
    userId: String(row.user_id),
    displayName: name,
    profilePic: row.profile_pic || null,
    thumb: row.thumb_url || row.media_url || null,
    mediaType: row.media_type,
    likes: Number(row.like_count || 0),
    comments: Number(row.comment_count || 0),
    href: `/video.html?post=${encodeURIComponent(row.id)}&app=1&fullscreen=1`,
    profileHref: `/creator-profile.html?userId=${encodeURIComponent(String(row.user_id))}&name=${encodeURIComponent(name)}&app=1`,
  };
}

async function sectionLiveNow(limit, hidden) {
  const params = [limit];
  let hiddenSql = '';
  if (hidden.length) {
    params.push(hidden);
    hiddenSql = `AND NOT (lr.host_user_id = ANY($${params.length}::uuid[]))`;
  }
  const res = await db.query(
    `SELECT lr.host_user_id AS user_id, lr.channel, lr.viewer_count, lr.room_type,
            u.first_name, u.last_name, u.profile_pic, u.id
     FROM live_rooms lr
     JOIN users u ON u.id = lr.host_user_id AND u.is_active = TRUE
     WHERE lr.status = 'active'
       ${hiddenSql}
     ORDER BY lr.viewer_count DESC NULLS LAST, lr.updated_at DESC
     LIMIT $1`,
    params
  );
  return res.rows.map(mapLiveRow);
}

async function sectionTrending(limit, hidden) {
  const half = RANKING.RECENCY_HALF_LIFE_HOURS;
  const likeW = RANKING.LIKE_WEIGHT;
  const commentW = RANKING.COMMENT_WEIGHT;
  const shareW = RANKING.SHARE_WEIGHT;
  const base = RANKING.BASE_SCORE;
  const params = [limit];
  let hiddenSql = '';
  if (hidden.length) {
    params.push(hidden);
    hiddenSql = `AND NOT (p.user_id = ANY($${params.length}::uuid[]))`;
  }
  const res = await db.query(
    `SELECT p.id, p.user_id, p.media_url, p.thumb_url, p.media_type,
            COALESCE(lc.c, 0)::int AS like_count,
            COALESCE(cc.c, 0)::int AS comment_count,
            u.first_name, u.last_name, u.profile_pic
     FROM social_posts p
     JOIN users u ON u.id = p.user_id AND u.is_active = TRUE
     LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_likes GROUP BY post_id) lc ON lc.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_comments GROUP BY post_id) cc ON cc.post_id = p.id
     WHERE COALESCE(p.visibility, 'public') = 'public'
       AND p.media_type = 'video'
       AND p.created_at > NOW() - INTERVAL '7 days'
       ${hiddenSql}
     ORDER BY (
       (${base}::float + COALESCE(lc.c, 0) * ${likeW} + COALESCE(cc.c, 0) * ${commentW}
         + COALESCE(p.share_count, 0) * ${shareW})
       * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)), 0) / 3600.0 / ${half})
     ) DESC
     LIMIT $1`,
    params
  );
  return res.rows.map(mapPostCard);
}

async function sectionNewCreators(limit, hidden) {
  const params = [limit];
  let hiddenSql = '';
  if (hidden.length) {
    params.push(hidden);
    hiddenSql = `AND NOT (u.id = ANY($${params.length}::uuid[]))`;
  }
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.role, u.is_verified,
            (SELECT COUNT(*)::int FROM user_follows WHERE following_id = u.id) AS followers,
            ag.agency_name,
            lr.channel AS live_channel,
            lr.room_type AS live_room_type,
            vl.name AS vip_level_name
     FROM users u
     LEFT JOIN LATERAL (
       SELECT a.name AS agency_name FROM host_profiles hp
       JOIN agencies a ON a.id = hp.agency_id AND a.status = 'active'
       WHERE hp.user_id = u.id AND COALESCE(hp.status, 'active') = 'active' LIMIT 1
     ) ag ON TRUE
     LEFT JOIN LATERAL (
       SELECT channel, room_type FROM live_rooms
       WHERE host_user_id = u.id AND status = 'active'
       ORDER BY viewer_count DESC NULLS LAST LIMIT 1
     ) lr ON TRUE
     LEFT JOIN vip_memberships vm ON vm.user_id = u.id
     LEFT JOIN vip_levels vl ON vl.id = vm.vip_level_id
     WHERE u.is_active = TRUE
       AND u.created_at > NOW() - INTERVAL '30 days'
       AND (
         u.role IN ('creator', 'host', 'worker')
         OR EXISTS (SELECT 1 FROM social_posts sp WHERE sp.user_id = u.id LIMIT 1)
         OR EXISTS (SELECT 1 FROM live_rooms WHERE host_user_id = u.id LIMIT 1)
       )
       ${hiddenSql}
     ORDER BY u.created_at DESC
     LIMIT $1`,
    params
  );
  return res.rows.map(mapCreatorCard);
}

async function sectionBecauseYouFollow(viewerId, limit, hidden) {
  const params = [viewerId, limit];
  let hiddenSql = '';
  if (hidden.length) {
    params.push(hidden);
    hiddenSql = `AND NOT (p.user_id = ANY($${params.length}::uuid[]))`;
  }
  const res = await db.query(
    `SELECT p.id, p.user_id, p.media_url, p.thumb_url, p.media_type,
            COALESCE(lc.c, 0)::int AS like_count,
            COALESCE(cc.c, 0)::int AS comment_count,
            u.first_name, u.last_name, u.profile_pic
     FROM social_posts p
     JOIN user_follows f ON f.following_id = p.user_id AND f.follower_id = $1
     JOIN users u ON u.id = p.user_id AND u.is_active = TRUE
     LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_likes GROUP BY post_id) lc ON lc.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_comments GROUP BY post_id) cc ON cc.post_id = p.id
     WHERE COALESCE(p.visibility, 'public') = 'public'
       ${hiddenSql}
     ORDER BY p.created_at DESC
     LIMIT $2`,
    params
  );
  return res.rows.map(mapPostCard);
}

/**
 * Auto featured video: highest engagement × recency among public videos.
 * Respects manual pin via users.featured_post_id when set and still valid.
 */
async function getFeaturedVideo(userId) {
  const pin = await db.query(
    `SELECT featured_post_id, bio, social_links FROM users WHERE id = $1`,
    [userId]
  ).catch(() => ({ rows: [] }));
  const featuredId = pin.rows[0]?.featured_post_id || null;
  if (featuredId) {
    const pinned = await db.query(
      `SELECT p.*, COALESCE(lc.c,0)::int AS like_count, COALESCE(cc.c,0)::int AS comment_count
       FROM social_posts p
       LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_likes GROUP BY post_id) lc ON lc.post_id = p.id
       LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_comments GROUP BY post_id) cc ON cc.post_id = p.id
       WHERE p.id = $1 AND p.user_id = $2
         AND COALESCE(p.visibility,'public') = 'public'
         AND p.media_type = 'video'`,
      [featuredId, userId]
    );
    if (pinned.rows[0]) {
      return { ...pinned.rows[0], featured_source: 'pinned' };
    }
  }

  const half = RANKING.RECENCY_HALF_LIFE_HOURS;
  const likeW = RANKING.LIKE_WEIGHT;
  const commentW = RANKING.COMMENT_WEIGHT;
  const shareW = RANKING.SHARE_WEIGHT;
  const res = await db.query(
    `SELECT p.*, COALESCE(lc.c,0)::int AS like_count, COALESCE(cc.c,0)::int AS comment_count
     FROM social_posts p
     LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_likes GROUP BY post_id) lc ON lc.post_id = p.id
     LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_comments GROUP BY post_id) cc ON cc.post_id = p.id
     WHERE p.user_id = $1
       AND COALESCE(p.visibility,'public') = 'public'
       AND p.media_type = 'video'
     ORDER BY (
       (1.0 + COALESCE(lc.c,0) * ${likeW} + COALESCE(cc.c,0) * ${commentW}
         + COALESCE(p.share_count,0) * ${shareW})
       * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)), 0) / 3600.0 / ${half})
     ) DESC
     LIMIT 1`,
    [userId]
  );
  if (!res.rows[0]) return null;
  return { ...res.rows[0], featured_source: 'auto' };
}

module.exports = {
  getDiscoveryRails,
  getFeaturedVideo,
};
