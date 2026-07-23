const db = require('../config/database');

async function createPost(userId, { body, mediaUrl, thumbUrl, mediaType, visibility }) {
  const text = String(body || '').trim();
  const media = mediaUrl ? String(mediaUrl).trim() : null;
  if (!text && !media) throw new Error('Post body or media required');
  const type =
    mediaType ||
    (media && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(media) ? 'video' : media ? 'image' : 'none');
  const vis = visibility === 'private' ? 'private' : 'public';
  const res = await db.query(
    `INSERT INTO social_posts (user_id, body, media_url, thumb_url, media_type, visibility)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, text || '', media, thumbUrl || null, type, vis]
  );
  return enrichPost(res.rows[0], userId);
}

async function enrichPost(post, viewerId) {
  const userRes = await db.query(
    `SELECT id, first_name, last_name, profile_pic FROM users WHERE id = $1`,
    [post.user_id]
  );
  const likesRes = await db.query(`SELECT COUNT(*)::int AS c FROM social_post_likes WHERE post_id = $1`, [post.id]);
  let liked = false;
  if (viewerId) {
    const l = await db.query(
      `SELECT 1 FROM social_post_likes WHERE post_id = $1 AND user_id = $2`,
      [post.id, viewerId]
    );
    liked = l.rows.length > 0;
  }
  const commentsRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM social_post_comments WHERE post_id = $1`,
    [post.id]
  );
  return {
    ...post,
    author: userRes.rows[0],
    like_count: likesRes.rows[0].c,
    comment_count: commentsRes.rows[0].c,
    liked,
  };
}

async function listFeed(viewerId, { limit = 30, offset = 0 } = {}) {
  const res = await db.query(
    `SELECT * FROM social_posts
     WHERE COALESCE(visibility, 'public') = 'public'
        OR user_id = $3
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, viewerId || null]
  );
  return Promise.all(res.rows.map((p) => enrichPost(p, viewerId)));
}

async function toggleLike(postId, userId) {
  const existing = await db.query(
    `SELECT 1 FROM social_post_likes WHERE post_id = $1 AND user_id = $2`,
    [postId, userId]
  );
  if (existing.rows.length) {
    await db.query(`DELETE FROM social_post_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    return { liked: false };
  }
  await db.query(`INSERT INTO social_post_likes (post_id, user_id) VALUES ($1, $2)`, [postId, userId]);
  return { liked: true };
}

async function addComment(postId, userId, body) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Comment required');
  const res = await db.query(
    `INSERT INTO social_post_comments (post_id, user_id, body) VALUES ($1, $2, $3) RETURNING *`,
    [postId, userId, text.slice(0, 2000)]
  );
  const userRes = await db.query(
    `SELECT id, first_name, last_name, profile_pic FROM users WHERE id = $1`,
    [userId]
  );
  return { ...res.rows[0], author: userRes.rows[0] };
}

async function listComments(postId, limit = 50) {
  const res = await db.query(
    `SELECT c.*, u.first_name, u.last_name, u.profile_pic
     FROM social_post_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.post_id = $1 ORDER BY c.created_at ASC LIMIT $2`,
    [postId, limit]
  );
  return res.rows;
}

async function sharePost(postId) {
  await db.query(
    `UPDATE social_posts SET share_count = share_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [postId]
  );
  const res = await db.query(`SELECT share_count FROM social_posts WHERE id = $1`, [postId]);
  return { share_count: res.rows[0]?.share_count || 0 };
}

async function deletePost(postId, userId) {
  const res = await db.query(
    `DELETE FROM social_posts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [postId, userId]
  );
  if (!res.rows[0]) throw new Error('Post not found');
  return { deleted: true };
}

module.exports = {
  createPost,
  listFeed,
  toggleLike,
  addComment,
  listComments,
  sharePost,
  deletePost,
};
