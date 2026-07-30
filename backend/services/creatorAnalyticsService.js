const db = require('../config/database');

/**
 * Creator analytics from existing tables.
 * Extension: attach watch_time / impressions later without UI rewrite —
 * keep shape { period, metrics, topContent, growth }.
 */
async function getCreatorAnalytics(userId, { period = 'week' } = {}) {
  const days = period === 'today' ? 1 : period === 'month' ? 30 : period === '90' ? 90 : 7;
  const since = `NOW() - INTERVAL '${days} days'`;

  const [posts, engagement, follows, live, gifts, top] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS posts,
              COUNT(*) FILTER (WHERE media_type = 'video')::int AS videos,
              COALESCE(SUM(share_count), 0)::int AS shares
       FROM social_posts
       WHERE user_id = $1 AND created_at >= ${since}`,
      [userId]
    ),
    db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM social_post_likes l
          JOIN social_posts p ON p.id = l.post_id
          WHERE p.user_id = $1 AND l.created_at >= ${since}) AS likes,
         (SELECT COUNT(*)::int FROM social_post_comments c
          JOIN social_posts p ON p.id = c.post_id
          WHERE p.user_id = $1 AND c.created_at >= ${since}) AS comments`,
      [userId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS gained
       FROM user_follows
       WHERE following_id = $1 AND created_at >= ${since}`,
      [userId]
    ).catch(() =>
      db.query(`SELECT COUNT(*)::int AS gained FROM user_follows WHERE following_id = $1`, [userId]).then((r) => ({
        rows: [{ gained: r.rows[0]?.gained || 0 }],
      }))
    ),
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN room_type = 'party' THEN 0 ELSE COALESCE(broadcast_seconds, 0) END), 0)::int AS live_seconds,
         COALESCE(SUM(CASE WHEN room_type = 'party' THEN COALESCE(broadcast_seconds, 0) ELSE 0 END), 0)::int AS party_seconds,
         COUNT(*)::int AS sessions,
         COALESCE(MAX(viewer_count), 0)::int AS peak_viewers
       FROM live_rooms
       WHERE host_user_id = $1
         AND (started_at >= ${since} OR updated_at >= ${since})`,
      [userId]
    ).catch(async () => {
      /* broadcast_seconds may be missing on older schemas */
      const alt = await db.query(
        `SELECT COUNT(*)::int AS sessions,
                COALESCE(MAX(viewer_count), 0)::int AS peak_viewers
         FROM live_rooms WHERE host_user_id = $1 AND updated_at >= ${since}`,
        [userId]
      );
      return {
        rows: [
          {
            live_seconds: 0,
            party_seconds: 0,
            sessions: alt.rows[0]?.sessions || 0,
            peak_viewers: alt.rows[0]?.peak_viewers || 0,
          },
        ],
      };
    }),
    db.query(
      `SELECT COUNT(*)::int AS gift_count,
              COALESCE(SUM(creator_amount), 0)::float AS gift_points
       FROM gift_transactions
       WHERE receiver_id = $1 AND created_at >= ${since}`,
      [userId]
    ),
    db.query(
      `SELECT p.id, p.body, p.media_type, p.media_url, p.thumb_url, p.created_at,
              COALESCE(lc.c, 0)::int AS likes,
              COALESCE(cc.c, 0)::int AS comments,
              COALESCE(p.share_count, 0)::int AS shares
       FROM social_posts p
       LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_likes GROUP BY post_id) lc ON lc.post_id = p.id
       LEFT JOIN (SELECT post_id, COUNT(*)::int AS c FROM social_post_comments GROUP BY post_id) cc ON cc.post_id = p.id
       WHERE p.user_id = $1 AND p.created_at >= ${since}
       ORDER BY (COALESCE(lc.c,0) * 3 + COALESCE(cc.c,0) * 5 + COALESCE(p.share_count,0) * 4) DESC
       LIMIT 5`,
      [userId]
    ),
  ]);

  const prevDays = days;
  const prevFollows = await db
    .query(
      `SELECT COUNT(*)::int AS gained
       FROM user_follows
       WHERE following_id = $1
         AND created_at >= NOW() - INTERVAL '${prevDays * 2} days'
         AND created_at < NOW() - INTERVAL '${prevDays} days'`,
      [userId]
    )
    .catch(() => ({ rows: [{ gained: 0 }] }));

  const liveRow = live.rows[0] || {};
  const metrics = {
    posts: posts.rows[0]?.posts || 0,
    videos: posts.rows[0]?.videos || 0,
    likes: engagement.rows[0]?.likes || 0,
    comments: engagement.rows[0]?.comments || 0,
    shares: posts.rows[0]?.shares || 0,
    followersGained: follows.rows[0]?.gained || 0,
    giftCount: gifts.rows[0]?.gift_count || 0,
    giftPoints: Math.round(Number(gifts.rows[0]?.gift_points || 0)),
    liveSessions: liveRow.sessions || 0,
    liveHours: Math.round(((liveRow.live_seconds || 0) / 3600) * 10) / 10,
    partyHours: Math.round(((liveRow.party_seconds || 0) / 3600) * 10) / 10,
    peakViewers: liveRow.peak_viewers || 0,
    /* Reserved for future event pipeline */
    views: null,
    reach: null,
    watchTimeHours: null,
  };

  const prevGain = prevFollows.rows[0]?.gained || 0;
  const growth = {
    followersGainedDelta: metrics.followersGained - prevGain,
    periodDays: days,
  };

  return {
    period,
    periodDays: days,
    metrics,
    growth,
    topContent: (top.rows || []).map((r) => ({
      id: r.id,
      caption: (r.body || '').slice(0, 80),
      mediaType: r.media_type,
      thumb: r.thumb_url || r.media_url,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      createdAt: r.created_at,
      href:
        r.media_type === 'video'
          ? `/video.html?post=${encodeURIComponent(r.id)}&app=1&fullscreen=1`
          : `/square.html?post=${encodeURIComponent(r.id)}&app=1`,
    })),
    /* Extension flag for future impression/watch-time events */
    eventsSupported: false,
  };
}

module.exports = { getCreatorAnalytics };
