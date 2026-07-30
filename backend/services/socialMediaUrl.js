/**
 * Social media URL abstraction.
 * Today: local disk under /uploads/social.
 * Later: swap PUBLIC_MEDIA_BASE / CDN without touching feed/controllers.
 */

const PUBLIC_MEDIA_BASE = String(process.env.PUBLIC_MEDIA_BASE || process.env.CDN_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');

function toPublicUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const p = String(pathOrUrl).trim();
  if (!p) return null;
  if (/^(https?:|data:|blob:)/i.test(p)) return p;
  if (PUBLIC_MEDIA_BASE) {
    return `${PUBLIC_MEDIA_BASE}${p.startsWith('/') ? p : `/${p}`}`;
  }
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * Carousel-ready media list. Currently one item from media_url / thumb_url.
 * When multi-image lands, prefer media_items JSONB and keep this shape.
 */
function normalizeMediaItems(post) {
  if (Array.isArray(post?.media_items) && post.media_items.length) {
    return post.media_items
      .map((m) => ({
        url: toPublicUrl(m.url || m.media_url || m.src) || null,
        thumb: toPublicUrl(m.thumb || m.thumb_url) || null,
        type: String(m.type || m.media_type || 'image').toLowerCase(),
      }))
      .filter((m) => m.url);
  }
  const url = toPublicUrl(post?.media_url || post?.mediaUrl);
  if (!url) return [];
  const type = String(post?.media_type || post?.mediaType || '').toLowerCase() ||
    (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? 'video' : 'image');
  return [
    {
      url,
      thumb: toPublicUrl(post?.thumb_url || post?.thumbUrl) || null,
      type: type === 'video' ? 'video' : type === 'none' ? 'none' : 'image',
    },
  ];
}

function primaryMedia(post) {
  const items = normalizeMediaItems(post);
  return items[0] || null;
}

module.exports = {
  PUBLIC_MEDIA_BASE,
  toPublicUrl,
  normalizeMediaItems,
  primaryMedia,
};
