const db = require('../config/database');
const followService = require('./followService');
const { normalizeMediaItems, toPublicUrl } = require('./socialMediaUrl');
const RANKING = require('../config/socialFeedRanking');

/** @Name / @First Last — prefer names over numeric display ids */
function extractMentionTokens(text) {
  const raw = String(text || '');
  const found = [];
  const re = /@([A-Za-z][A-Za-z0-9_]*(?:\s+[A-Za-z][A-Za-z0-9_]*){0,2}|[0-9]{4,12})/g;
  let m;
  while ((m = re.exec(raw))) {
    const token = String(m[1] || '').trim();
    if (token) found.push(token);
  }
  return [...new Set(found)];
}

async function resolveMentionedUserIds(tokens) {
  if (!tokens.length) return [];
  const lower = tokens.map((t) => t.toLowerCase());
  const compact = tokens.map((t) => t.toLowerCase().replace(/\s+/g, ''));
  const res = await db.query(
    `SELECT id FROM users
     WHERE LOWER(display_id::text) = ANY($1::text[])
        OR LOWER(TRIM(BOTH FROM COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))) = ANY($1::text[])
        OR LOWER(REPLACE(TRIM(BOTH FROM COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ' ', '')) = ANY($2::text[])
        OR LOWER(COALESCE(first_name,'')) = ANY($1::text[])
     LIMIT 20`,
    [lower, compact]
  );
  return res.rows.map((r) => r.id);
}

async function createPost(userId, { body, mediaUrl, thumbUrl, mediaType, visibility, mediaItems } = {}) {
  const text = String(body || '').trim();
  let media = mediaUrl ? String(mediaUrl).trim() : null;
  let thumb = thumbUrl ? String(thumbUrl).trim() : null;
  let type = mediaType || null;

  /* Carousel-ready: accept mediaItems[0] as primary until multi-image ships */
  if ((!media || !type) && Array.isArray(mediaItems) && mediaItems[0]) {
    const first = mediaItems[0];
    media = media || first.url || first.media_url || null;
    thumb = thumb || first.thumb || first.thumb_url || null;
    type = type || first.type || first.media_type || null;
  }

  if (!text && !media) throw new Error('Post body or media required');
  type =
    type ||
    (media && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(media) ? 'video' : media ? 'image' : 'none');
  const vis = visibility === 'private' ? 'private' : 'public';
  const res = await db.query(
    `INSERT INTO social_posts (user_id, body, media_url, thumb_url, media_type, visibility)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, text || '', media, thumb || null, type, vis]
  );
  const enriched = await enrichPosts([res.rows[0]], userId);

  if (vis === 'public') {
    setImmediate(() => {
      (async () => {
        try {
          const pushNotificationService = require('./pushNotificationService');
          const nameRes = await db.query(
            `SELECT first_name, last_name, display_id FROM users WHERE id = $1`,
            [userId]
          );
          const u = nameRes.rows[0] || {};
          const name =
            `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.display_id || 'A creator';
          const followers = await db.query(
            `SELECT follower_id FROM user_follows WHERE following_id = $1`,
            [userId]
          );
          const template = pushNotificationService.TEMPLATES.post_published(
            name,
            res.rows[0].id
          );
          pushNotificationService.queuePushMany(
            followers.rows.map((r) => r.follower_id),
            template,
            { dedupeKey: `post:${res.rows[0].id}` }
          );

          const tokens = extractMentionTokens(text);
          if (tokens.length) {
            const mentionedIds = await resolveMentionedUserIds(tokens);
            await pushNotificationService.notifyMentions(mentionedIds, userId, {
              postId: res.rows[0].id,
              label: 'a post',
            });
          }
        } catch (err) {
          console.warn('[post] push failed', err.message);
        }
      })();
    });
  }

  return enriched[0];
}

function mapPostRow(row, { liked = false, author = null } = {}) {
  const mediaItems = normalizeMediaItems(row);
  const primary = mediaItems[0] || null;
  return {
    ...row,
    media_url: primary?.url || toPublicUrl(row.media_url),
    thumb_url: primary?.thumb || toPublicUrl(row.thumb_url),
    media_items: mediaItems,
    author: author || {
      id: row.author_id,
      first_name: row.first_name,
      last_name: row.last_name,
      profile_pic: row.profile_pic,
      display_id: row.display_id,
      role: row.author_role,
      is_verified: row.is_verified,
    },
    like_count: Number(row.like_count || 0),
    comment_count: Number(row.comment_count || 0),
    share_count: Number(row.share_count || 0),
    liked: !!liked,
    likers: Array.isArray(row.likers) ? row.likers : [],
    /* Extension points — clients ignore until features ship */
    bookmarks_supported: false,
    realtime_channel: null,
  };
}

/**
 * Batch enrich posts (kills N+1). Accepts raw social_posts rows or joined rows.
 */
async function enrichPosts(posts, viewerId) {
  if (!posts?.length) return [];
  const ids = posts.map((p) => p.id);
  const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];

  const [usersRes, likesRes, commentsRes, likedRes, likersRes] = await Promise.all([
    userIds.length
      ? db.query(
          `SELECT id, first_name, last_name, profile_pic, display_id, role, is_verified
           FROM users WHERE id = ANY($1::uuid[])`,
          [userIds]
        )
      : Promise.resolve({ rows: [] }),
    db.query(
      `SELECT post_id, COUNT(*)::int AS c FROM social_post_likes
       WHERE post_id = ANY($1::uuid[]) GROUP BY post_id`,
      [ids]
    ),
    db.query(
      `SELECT post_id, COUNT(*)::int AS c FROM social_post_comments
       WHERE post_id = ANY($1::uuid[]) GROUP BY post_id`,
      [ids]
    ),
    viewerId
      ? db.query(
          `SELECT post_id FROM social_post_likes
           WHERE post_id = ANY($1::uuid[]) AND user_id = $2`,
          [ids, viewerId]
        )
      : Promise.resolve({ rows: [] }),
    db.query(
      `SELECT post_id, user_id, first_name, last_name, profile_pic, display_id
       FROM (
         SELECT spl.post_id,
                u.id AS user_id,
                u.first_name,
                u.last_name,
                u.profile_pic,
                u.display_id,
                ROW_NUMBER() OVER (PARTITION BY spl.post_id ORDER BY spl.created_at DESC) AS rn
         FROM social_post_likes spl
         JOIN users u ON u.id = spl.user_id AND u.is_active = TRUE
         WHERE spl.post_id = ANY($1::uuid[])
       ) ranked
       WHERE rn <= 6`,
      [ids]
    ),
  ]);

  const authors = new Map(usersRes.rows.map((u) => [String(u.id), u]));
  const likeMap = new Map(likesRes.rows.map((r) => [String(r.post_id), r.c]));
  const commentMap = new Map(commentsRes.rows.map((r) => [String(r.post_id), r.c]));
  const likedSet = new Set(likedRes.rows.map((r) => String(r.post_id)));
  const likerMap = new Map();
  likersRes.rows.forEach((r) => {
    const pid = String(r.post_id);
    if (!likerMap.has(pid)) likerMap.set(pid, []);
    likerMap.get(pid).push({
      userId: String(r.user_id),
      displayName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'User',
      profilePic: r.profile_pic || null,
      displayId: r.display_id != null ? String(r.display_id) : null,
    });
  });

  return posts.map((p) =>
    mapPostRow(
      {
        ...p,
        like_count: likeMap.get(String(p.id)) || 0,
        comment_count: commentMap.get(String(p.id)) || 0,
        likers: likerMap.get(String(p.id)) || [],
      },
      {
        liked: likedSet.has(String(p.id)),
        author: authors.get(String(p.user_id)) || null,
      }
    )
  );
}

async function getCreatorPostCounts(userId, viewerId = null) {
  const isOwner = viewerId && String(viewerId) === String(userId);
  const res = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE media_type IS DISTINCT FROM 'video')::int AS posts_count,
       COUNT(*) FILTER (WHERE media_type = 'video')::int AS videos_count,
       COUNT(*)::int AS total_count
     FROM social_posts
     WHERE user_id = $1
       AND (
         COALESCE(visibility, 'public') = 'public'
         OR ($2::boolean IS TRUE)
       )`,
    [userId, !!isOwner]
  );
  return res.rows[0] || { posts_count: 0, videos_count: 0, total_count: 0 };
}

/**
 * List feed.
 * @param {object} opts
 * @param {string} [opts.userId] — creator profile filter
 * @param {'for_you'|'following'|'latest'} [opts.feed]
 * @param {'video'|'image'|'all'} [opts.mediaType]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
async function listFeed(viewerId, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 30, 1), 50);
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);
  const creatorId = opts.userId ? String(opts.userId).trim() : null;
  const mediaType = String(opts.mediaType || opts.media_type || 'all').toLowerCase();
  let feed = String(opts.feed || opts.scope || '').toLowerCase();
  if (!feed) feed = creatorId ? 'latest' : 'for_you';
  if (!['for_you', 'following', 'latest'].includes(feed)) feed = 'for_you';

  const hidden = viewerId ? await followService.getHiddenUserIdSet(viewerId) : new Set();
  const hiddenArr = [...hidden];

  const params = [];
  const where = [];

  /* Visibility: public OR own private */
  params.push(viewerId || null);
  const viewerParam = `$${params.length}`;
  where.push(`(COALESCE(p.visibility, 'public') = 'public' OR p.user_id = ${viewerParam})`);

  if (creatorId) {
    params.push(creatorId);
    where.push(`p.user_id = $${params.length}`);
  }

  if (mediaType === 'video') {
    where.push(`p.media_type = 'video'`);
  } else if (mediaType === 'posts' || mediaType === 'photo' || mediaType === 'image') {
    /* Posts tab: everything that is not a video reel */
    where.push(`(p.media_type IS DISTINCT FROM 'video')`);
  }

  if (hiddenArr.length) {
    params.push(hiddenArr);
    where.push(`NOT (p.user_id = ANY($${params.length}::uuid[]))`);
  }

  if (feed === 'following') {
    if (!viewerId) return [];
    params.push(viewerId);
    where.push(
      `p.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = $${params.length})`
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const halfLife = RANKING.RECENCY_HALF_LIFE_HOURS;
  const likeW = RANKING.LIKE_WEIGHT;
  const commentW = RANKING.COMMENT_WEIGHT;
  const shareW = RANKING.SHARE_WEIGHT;
  const base = RANKING.BASE_SCORE;

  let orderSql = 'ORDER BY p.created_at DESC';
  if (feed === 'for_you' && !creatorId) {
    orderSql = `ORDER BY (
      (${base}::float
        + COALESCE(lc.c, 0) * ${likeW}
        + COALESCE(cc.c, 0) * ${commentW}
        + COALESCE(p.share_count, 0) * ${shareW}
      ) * EXP(
        -GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)), 0) / 3600.0 / ${halfLife}
      )
    ) DESC, p.created_at DESC`;
  }

  params.push(limit);
  const limParam = `$${params.length}`;
  params.push(offset);
  const offParam = `$${params.length}`;

  const res = await db.query(
    `SELECT p.*,
            COALESCE(lc.c, 0)::int AS like_count,
            COALESCE(cc.c, 0)::int AS comment_count
     FROM social_posts p
     LEFT JOIN (
       SELECT post_id, COUNT(*)::int AS c FROM social_post_likes GROUP BY post_id
     ) lc ON lc.post_id = p.id
     LEFT JOIN (
       SELECT post_id, COUNT(*)::int AS c FROM social_post_comments GROUP BY post_id
     ) cc ON cc.post_id = p.id
     ${whereSql}
     ${orderSql}
     LIMIT ${limParam} OFFSET ${offParam}`,
    params
  );

  return enrichPosts(res.rows, viewerId);
}

async function toggleLike(postId, userId) {
  const existing = await db.query(
    `SELECT 1 FROM social_post_likes WHERE post_id = $1 AND user_id = $2`,
    [postId, userId]
  );
  if (existing.rows.length) {
    await db.query(`DELETE FROM social_post_likes WHERE post_id = $1 AND user_id = $2`, [
      postId,
      userId,
    ]);
    return { liked: false };
  }
  await db.query(
    `INSERT INTO social_post_likes (post_id, user_id) VALUES ($1, $2)
     ON CONFLICT (post_id, user_id) DO NOTHING`,
    [postId, userId]
  );
  return { liked: true };
}

async function listPostLikers(postId, { limit = 50, offset = 0 } = {}) {
  const id = String(postId || '').trim();
  if (!id) return [];
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.display_id, spl.created_at
     FROM social_post_likes spl
     JOIN users u ON u.id = spl.user_id AND u.is_active = TRUE
     WHERE spl.post_id = $1
     ORDER BY spl.created_at DESC
     LIMIT $2 OFFSET $3`,
    [id, lim, off]
  );
  return res.rows.map((r) => ({
    userId: String(r.id),
    displayName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'User',
    profilePic: r.profile_pic || null,
    displayId: r.display_id != null ? String(r.display_id) : null,
    likedAt: r.created_at,
  }));
}

async function addComment(postId, userId, body, { parentId = null } = {}) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Comment required');
  let parent = null;
  if (parentId) {
    const parentRes = await db.query(
      `SELECT id, post_id FROM social_post_comments
       WHERE id = $1 AND deleted_at IS NULL`,
      [parentId]
    );
    parent = parentRes.rows[0];
    if (!parent || String(parent.post_id) !== String(postId)) {
      throw new Error('Invalid reply target');
    }
  }
  const res = await db.query(
    `INSERT INTO social_post_comments (post_id, user_id, body, parent_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [postId, userId, text.slice(0, 2000), parent ? parent.id : null]
  );
  const userRes = await db.query(
    `SELECT id, first_name, last_name, profile_pic, display_id FROM users WHERE id = $1`,
    [userId]
  );

  setImmediate(() => {
    (async () => {
      try {
        const pushNotificationService = require('./pushNotificationService');
        const postRes = await db.query(`SELECT user_id FROM social_posts WHERE id = $1`, [postId]);
        const ownerId = postRes.rows[0]?.user_id;
        if (ownerId) {
          await pushNotificationService.notifyComment(ownerId, userId, postId);
        }

        const tokens = extractMentionTokens(text);
        if (tokens.length) {
          const mentionedIds = await resolveMentionedUserIds(tokens);
          await pushNotificationService.notifyMentions(mentionedIds, userId, {
            postId,
            label: 'a comment',
          });
        }
      } catch (err) {
        console.warn('[comment] push failed', err.message);
      }
    })();
  });

  return {
    ...res.rows[0],
    like_count: 0,
    liked: false,
    author: userRes.rows[0],
  };
}

async function listComments(postId, { limit = 50, offset = 0, viewerId = null } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const res = await db.query(
    `SELECT c.id, c.post_id, c.user_id, c.body, c.parent_id, c.created_at,
            u.first_name, u.last_name, u.profile_pic, u.display_id,
            p.user_id AS post_owner_id,
            (SELECT COUNT(*)::int FROM social_comment_likes cl WHERE cl.comment_id = c.id) AS like_count,
            CASE
              WHEN $4::uuid IS NULL THEN false
              ELSE EXISTS (
                SELECT 1 FROM social_comment_likes cl
                WHERE cl.comment_id = c.id AND cl.user_id = $4::uuid
              )
            END AS liked
     FROM social_post_comments c
     JOIN users u ON u.id = c.user_id
     JOIN social_posts p ON p.id = c.post_id
     WHERE c.post_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC
     LIMIT $2 OFFSET $3`,
    [postId, lim, off, viewerId || null]
  );
  return res.rows;
}

async function toggleCommentLike(commentId, userId) {
  const comment = await db.query(
    `SELECT id FROM social_post_comments WHERE id = $1 AND deleted_at IS NULL`,
    [commentId]
  );
  if (!comment.rows[0]) throw new Error('Comment not found');
  const existing = await db.query(
    `SELECT 1 FROM social_comment_likes WHERE comment_id = $1 AND user_id = $2`,
    [commentId, userId]
  );
  if (existing.rows.length) {
    await db.query(`DELETE FROM social_comment_likes WHERE comment_id = $1 AND user_id = $2`, [
      commentId,
      userId,
    ]);
    const count = await db.query(
      `SELECT COUNT(*)::int AS n FROM social_comment_likes WHERE comment_id = $1`,
      [commentId]
    );
    return { liked: false, like_count: count.rows[0]?.n || 0 };
  }
  await db.query(
    `INSERT INTO social_comment_likes (comment_id, user_id) VALUES ($1, $2)
     ON CONFLICT (comment_id, user_id) DO NOTHING`,
    [commentId, userId]
  );
  const count = await db.query(
    `SELECT COUNT(*)::int AS n FROM social_comment_likes WHERE comment_id = $1`,
    [commentId]
  );
  return { liked: true, like_count: count.rows[0]?.n || 0 };
}

const COMMENT_ADMIN_ROLES = new Set(['admin', 'super_admin', 'founder', 'ceo']);

async function deleteComment(commentId, userId, { role = null } = {}) {
  const row = await db.query(
    `SELECT c.id, c.user_id AS commenter_id, p.user_id AS post_owner_id
     FROM social_post_comments c
     JOIN social_posts p ON p.id = c.post_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [commentId]
  );
  if (!row.rows[0]) throw new Error('Comment not found');
  const commenter = String(row.rows[0].commenter_id);
  const owner = String(row.rows[0].post_owner_id);
  const me = String(userId);
  const isAdmin = COMMENT_ADMIN_ROLES.has(String(role || '').toLowerCase());
  if (me !== commenter && me !== owner && !isAdmin) {
    throw new Error('Not allowed to delete this comment');
  }
  await db.query(
    `UPDATE social_post_comments
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $2
     WHERE id = $1`,
    [commentId, userId]
  );
  return { deleted: true };
}

async function sharePost(postId) {
  await db.query(
    `UPDATE social_posts SET share_count = share_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [postId]
  );
  const res = await db.query(`SELECT share_count FROM social_posts WHERE id = $1`, [postId]);
  return { share_count: res.rows[0]?.share_count || 0 };
}

async function deletePost(postId, userId, { role = null } = {}) {
  const row = await db.query(`SELECT id, user_id FROM social_posts WHERE id = $1`, [postId]);
  if (!row.rows[0]) throw new Error('Post not found');
  const owner = String(row.rows[0].user_id);
  const me = String(userId);
  const isAdmin = COMMENT_ADMIN_ROLES.has(String(role || '').toLowerCase());
  if (me !== owner && !isAdmin) {
    throw new Error('Not allowed to delete this post');
  }
  await db.query(`DELETE FROM social_posts WHERE id = $1`, [postId]);
  return { deleted: true };
}

module.exports = {
  createPost,
  listFeed,
  enrichPosts,
  getCreatorPostCounts,
  toggleLike,
  listPostLikers,
  addComment,
  listComments,
  toggleCommentLike,
  deleteComment,
  sharePost,
  deletePost,
  RANKING,
};
