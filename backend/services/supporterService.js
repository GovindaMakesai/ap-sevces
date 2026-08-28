const db = require('../config/database');
const { sqlExcludeSecretSenders } = require('../lib/secretGiftSender');

function periodStart(period) {
  const now = new Date();
  const p = String(period || 'monthly').toLowerCase();
  if (p === 'daily') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === 'weekly') {
    return new Date(now.getTime() - 7 * 86400000);
  }
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDisplayName(row) {
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'User';
}

async function getTopSupporters(receiverId, { period = 'monthly', limit = 50 } = {}) {
  const id = String(receiverId || '').trim();
  if (!id) return [];
  const since = periodStart(period);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const secret = sqlExcludeSecretSenders({ startParam: 4 });
  const res = await db.query(
    `SELECT gt.sender_id AS user_id,
            SUM(gt.coin_amount)::bigint AS coins,
            COUNT(*)::int AS gift_count,
            u.first_name, u.last_name, u.profile_pic, u.display_id, u.updated_at
     FROM gift_transactions gt
     JOIN users u ON u.id = gt.sender_id AND u.is_active = TRUE
     WHERE gt.receiver_id = $1 AND gt.created_at >= $2
       AND gt.coin_amount::numeric > 0
       AND gt.gift_type NOT LIKE '%\\_reversed' ESCAPE '\\'
       ${secret.sql}
     GROUP BY gt.sender_id, u.first_name, u.last_name, u.profile_pic, u.display_id, u.updated_at
     ORDER BY coins DESC, gift_count DESC
     LIMIT $3`,
    [id, since.toISOString(), lim, ...secret.params]
  );
  return res.rows.map((r, i) => ({
    rank: i + 1,
    userId: String(r.user_id),
    displayName: buildDisplayName(r),
    profilePic: r.profile_pic || null,
    profileUpdatedAt: r.updated_at || null,
    displayId: r.display_id != null ? String(r.display_id) : null,
    coins: Number(r.coins || 0),
    giftCount: Number(r.gift_count || 0),
  }));
}

async function getRecentGifts(receiverId, { limit = 30 } = {}) {
  const id = String(receiverId || '').trim();
  if (!id) return [];
  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  const res = await db.query(
    `SELECT gt.id, gt.sender_id, gt.gift_type, gt.coin_amount, gt.created_at,
            u.first_name, u.last_name, u.profile_pic, u.display_id, u.updated_at, u.email
     FROM gift_transactions gt
     JOIN users u ON u.id = gt.sender_id AND u.is_active = TRUE
     WHERE gt.receiver_id = $1 AND gt.coin_amount::numeric > 0
       AND gt.gift_type NOT LIKE '%\\_reversed' ESCAPE '\\'
     ORDER BY gt.created_at DESC
     LIMIT $2`,
    [id, lim]
  );
  const { loadSecretSenderIds } = require('../lib/secretGiftSender');
  const secretIds = await loadSecretSenderIds(db);
  return res.rows.map((r) => {
    const secret = secretIds.has(String(r.sender_id));
    return {
      id: String(r.id),
      senderId: secret ? null : String(r.sender_id),
      senderName: secret ? 'Secret Fan' : buildDisplayName(r),
      profilePic: secret ? null : r.profile_pic || null,
      profileUpdatedAt: secret ? null : r.updated_at || null,
      displayId: secret ? null : r.display_id != null ? String(r.display_id) : null,
      giftType: r.gift_type,
      coins: Number(r.coin_amount || 0),
      createdAt: r.created_at,
      secret,
    };
  });
}

module.exports = { getTopSupporters, getRecentGifts, periodStart };
