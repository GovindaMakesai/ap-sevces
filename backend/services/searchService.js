const db = require('../config/database');

async function globalSearch({ q, type = 'all', limit = 20, offset = 0 } = {}) {
  const query = String(q || '').trim();
  if (!query || query.length < 2) {
    return { users: [], live_rooms: [], coin_sellers: [], total: 0 };
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const like = `%${query}%`;
  const isUuid = /^[0-9a-f-]{8,}$/i.test(query);
  const results = { users: [], live_rooms: [], coin_sellers: [], total: 0 };

  if (type === 'all' || type === 'users' || type === 'creators') {
    const displayId = /^\d{6,8}$/.test(query) ? Number(query) : null;
    const users = await db.query(
      `SELECT id, first_name, last_name, email, role, profile_pic, display_id,
              CASE WHEN role IN ('creator','worker','host') THEN true ELSE false END AS is_creator
       FROM users
       WHERE (
         email ILIKE $1 OR phone ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1
         OR id::text = $2 OR CAST(id AS text) LIKE $1
         OR ($5::int IS NOT NULL AND display_id = $5)
         OR CAST(display_id AS text) LIKE $1
       )
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [like, query, lim, off, displayId]
    );
    results.users = users.rows;
  }

  if (type === 'all' || type === 'live' || type === 'party') {
    const roomType = type === 'party' ? 'party' : type === 'live' ? 'live' : null;
    const params = [like, query, lim, off];
    let typeClause = '';
    if (roomType) {
      typeClause = `AND lr.room_type = $5`;
      params.push(roomType);
    }
    const rooms = await db.query(
      `SELECT lr.channel, lr.room_type, lr.host_display_name, lr.viewer_count, lr.status, lr.started_at,
              u.id AS host_id
       FROM live_rooms lr
       LEFT JOIN users u ON u.id = lr.host_user_id
       WHERE lr.status = 'active' ${typeClause}
         AND (lr.channel ILIKE $1 OR lr.host_display_name ILIKE $1
              OR CAST(lr.host_user_id AS text) = $2)
       ORDER BY lr.viewer_count DESC, lr.updated_at DESC
       LIMIT $3 OFFSET $4`,
      params
    );
    results.live_rooms = rooms.rows;
  }

  if (type === 'all' || type === 'coin_sellers') {
    const sellers = await db.query(
      `SELECT p.user_id, p.display_name, p.inventory_coins, p.total_sold, u.first_name, u.last_name
       FROM coin_seller_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.is_active = TRUE AND (
         p.display_name ILIKE $1 OR u.email ILIKE $1
         OR CAST(p.user_id AS text) = $2 OR CAST(p.user_id AS text) LIKE $1
       )
       ORDER BY p.inventory_coins DESC
       LIMIT $3 OFFSET $4`,
      [like, query, lim, off]
    );
    results.coin_sellers = sellers.rows;
  }

  results.total = results.users.length + results.live_rooms.length + results.coin_sellers.length;
  return results;
}

module.exports = { globalSearch };
