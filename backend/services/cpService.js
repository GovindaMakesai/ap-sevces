const db = require('../config/database');
const followService = require('./followService');
const walletService = require('./walletService');

const CP_SUPPORT_UNLOCK = 2000;
const CP_SUPPORT_INVITE = 5000;
const INTIMACY_DISPLAY_MULT = 10;
const INTIMACY_INVITE_MIN = CP_SUPPORT_INVITE * INTIMACY_DISPLAY_MULT;
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const REJECT_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const CP_RINGS = [
  { id: 'ruby', name: 'Ruby Ring', price: 45000, emoji: '💎', color: '#f472b6' },
  { id: 'wings', name: 'Wings of love', price: 150000, emoji: '👑', color: '#34d399' },
  { id: 'cp', name: 'CP Ring', price: 360000, emoji: '💍', color: '#22d3ee' },
  { id: 'celeste', name: 'Celeste', price: 240000, emoji: '🌙', color: '#2dd4bf' },
  { id: 'mystique', name: 'Mystique', price: 540000, emoji: '🦋', color: '#f472b6' },
  { id: 'aura', name: 'Aura', price: 1800000, emoji: '✨', color: '#60a5fa' },
];

function pairKey(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? [x, y] : [y, x];
}

function ringById(id) {
  return CP_RINGS.find((r) => r.id === id) || null;
}

async function addSupportPoints(userIdA, userIdB, points) {
  const amt = Math.max(0, Math.floor(Number(points) || 0));
  if (!amt || String(userIdA) === String(userIdB)) return;
  const [user_a, user_b] = pairKey(userIdA, userIdB);
  await db.query(
    `INSERT INTO user_cp_support (user_a, user_b, points, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (user_a, user_b)
     DO UPDATE SET points = user_cp_support.points + EXCLUDED.points, updated_at = CURRENT_TIMESTAMP`,
    [user_a, user_b, amt]
  );
}

async function getSupportPoints(userIdA, userIdB) {
  const [user_a, user_b] = pairKey(userIdA, userIdB);
  const res = await db.query(
    `SELECT points FROM user_cp_support WHERE user_a = $1 AND user_b = $2`,
    [user_a, user_b]
  );
  return Number(res.rows[0]?.points || 0);
}

async function getActiveCp(userId) {
  const uid = String(userId);
  const res = await db.query(
    `SELECT r.*, 
            CASE WHEN r.user_a = $1 THEN r.user_b ELSE r.user_a END AS partner_id
     FROM cp_relationships r
     WHERE (r.user_a = $1 OR r.user_b = $1) AND r.status = 'active'
     LIMIT 1`,
    [uid]
  );
  const row = res.rows[0];
  if (!row) return null;
  const partnerId = row.partner_id;
  const partner = await db.query(
    `SELECT id, first_name, last_name, profile_pic, display_id FROM users WHERE id = $1`,
    [partnerId]
  );
  const p = partner.rows[0];
  const started = new Date(row.started_at);
  const days = Math.max(0, Math.floor((Date.now() - started.getTime()) / 86400000));
  return {
    id: row.id,
    partnerId: String(partnerId),
    partnerName: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'User' : 'User',
    partnerPic: p?.profile_pic || null,
    partnerDisplayId: p?.display_id || null,
    ringId: row.ring_id,
    ring: ringById(row.ring_id),
    startedAt: row.started_at,
    daysTogether: days,
  };
}

async function listRings() {
  return CP_RINGS;
}

async function purchaseRing(userId, ringId) {
  const ring = ringById(ringId);
  if (!ring) throw new Error('Ring not found');
  await walletService.debitCoins(userId, ring.price, {
    type: 'cp_ring_purchase',
    metadata: { ring_id: ringId },
  });
  await db.query(
    `INSERT INTO cp_user_rings (user_id, ring_id, quantity, updated_at)
     VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, ring_id)
     DO UPDATE SET quantity = cp_user_rings.quantity + 1, updated_at = CURRENT_TIMESTAMP`,
    [userId, ringId]
  );
  return ring;
}

async function getUserRingQty(userId, ringId) {
  const res = await db.query(
    `SELECT quantity FROM cp_user_rings WHERE user_id = $1 AND ring_id = $2`,
    [userId, ringId]
  );
  return Number(res.rows[0]?.quantity || 0);
}

async function listUserOwnedRings(userId) {
  const res = await db.query(
    `SELECT ring_id, quantity FROM cp_user_rings WHERE user_id = $1 AND quantity > 0 ORDER BY updated_at DESC`,
    [userId]
  );
  return res.rows
    .map((row) => {
      const ring = ringById(row.ring_id);
      if (!ring) return null;
      return { ...ring, quantity: Number(row.quantity || 0) };
    })
    .filter(Boolean);
}

async function userHasAnyRing(userId) {
  const res = await db.query(
    `SELECT 1 FROM cp_user_rings WHERE user_id = $1 AND quantity > 0 LIMIT 1`,
    [userId]
  );
  return Boolean(res.rows[0]);
}

async function lookupUserForInvite(viewerId, displayIdRaw) {
  const displayId = String(displayIdRaw || '').trim();
  if (!displayId) throw new Error('Enter a user ID');
  const res = await db.query(
    `SELECT id, first_name, last_name, profile_pic, display_id, gender
     FROM users WHERE CAST(display_id AS TEXT) = $1 LIMIT 1`,
    [displayId]
  );
  const u = res.rows[0];
  if (!u) throw new Error('User not found');
  if (String(u.id) === String(viewerId)) throw new Error('Cannot invite yourself');
  const support = await getSupportPoints(viewerId, u.id);
  const intimacyValue = support * INTIMACY_DISPLAY_MULT;
  return {
    userId: String(u.id),
    displayId: u.display_id != null ? String(u.display_id) : displayId,
    name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User',
    profilePic: u.profile_pic || null,
    gender: u.gender || null,
    supportPoints: support,
    intimacyValue,
    canInvite: support >= CP_SUPPORT_INVITE,
    intimacyInviteMin: INTIMACY_INVITE_MIN,
  };
}

async function getCpPairsInRoom(userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  if (ids.length < 2) return [];
  const res = await db.query(
    `SELECT r.user_a, r.user_b, r.ring_id,
            ua.first_name AS a_fn, ua.last_name AS a_ln, ua.profile_pic AS a_pic, ua.display_id AS a_did,
            ub.first_name AS b_fn, ub.last_name AS b_ln, ub.profile_pic AS b_pic, ub.display_id AS b_did
     FROM cp_relationships r
     JOIN users ua ON ua.id = r.user_a
     JOIN users ub ON ub.id = r.user_b
     WHERE r.status = 'active'
       AND r.user_a::text = ANY($1::text[])
       AND r.user_b::text = ANY($1::text[])`,
    [ids]
  );
  return res.rows.map((row) => ({
    userA: {
      userId: String(row.user_a),
      name: `${row.a_fn || ''} ${row.a_ln || ''}`.trim() || 'User',
      profilePic: row.a_pic || null,
      displayId: row.a_did != null ? String(row.a_did) : null,
    },
    userB: {
      userId: String(row.user_b),
      name: `${row.b_fn || ''} ${row.b_ln || ''}`.trim() || 'User',
      profilePic: row.b_pic || null,
      displayId: row.b_did != null ? String(row.b_did) : null,
    },
    ring: ringById(row.ring_id),
  }));
}

async function sendInvite(fromUserId, toUserId, ringId) {
  if (String(fromUserId) === String(toUserId)) throw new Error('Cannot invite yourself');
  const existing = await getActiveCp(fromUserId);
  if (existing) throw new Error('You already have a CP partner');
  const targetCp = await getActiveCp(toUserId);
  if (targetCp) throw new Error('That user already has a CP partner');

  const support = await getSupportPoints(fromUserId, toUserId);
  if (support < CP_SUPPORT_INVITE) {
    throw new Error(
      `Need intimacy value >= ${INTIMACY_INVITE_MIN.toLocaleString()} (you have ${(support * INTIMACY_DISPLAY_MULT).toLocaleString()})`
    );
  }

  const mutual =
    (await followService.isFollowing(fromUserId, toUserId)) &&
    (await followService.isFollowing(toUserId, fromUserId));
  if (!mutual) throw new Error('You must be friends (mutual follow) to send a CP invite');

  const cd = await db.query(
    `SELECT until_at FROM cp_invite_cooldowns WHERE from_user_id = $1 AND to_user_id = $2 AND until_at > NOW()`,
    [fromUserId, toUserId]
  );
  if (cd.rows[0]) throw new Error('Invite cooldown active — try again in 48 hours');

  const qty = await getUserRingQty(fromUserId, ringId);
  if (qty < 1) throw new Error('You need to own this ring — buy one in the Store');

  const expires = new Date(Date.now() + INVITE_TTL_MS);
  const res = await db.query(
    `INSERT INTO cp_invitations (from_user_id, to_user_id, ring_id, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [fromUserId, toUserId, ringId, expires.toISOString()]
  );

  await db.query(
    `UPDATE cp_user_rings SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND ring_id = $2 AND quantity > 0`,
    [fromUserId, ringId]
  );

  return res.rows[0];
}

async function respondInvite(userId, inviteId, accept) {
  const res = await db.query(`SELECT * FROM cp_invitations WHERE id = $1`, [inviteId]);
  const inv = res.rows[0];
  if (!inv) throw new Error('Invitation not found');
  if (String(inv.to_user_id) !== String(userId)) throw new Error('Not your invitation');
  if (inv.status !== 'pending') throw new Error('Invitation already handled');
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    await db.query(`UPDATE cp_invitations SET status = 'expired', responded_at = NOW() WHERE id = $1`, [
      inviteId,
    ]);
    await returnRingToBag(inv.from_user_id, inv.ring_id);
    throw new Error('Invitation expired');
  }

  if (!accept) {
    await db.query(
      `UPDATE cp_invitations SET status = 'rejected', responded_at = NOW() WHERE id = $1`,
      [inviteId]
    );
    await returnRingToBag(inv.from_user_id, inv.ring_id);
    await db.query(
      `INSERT INTO cp_invite_cooldowns (from_user_id, to_user_id, until_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET until_at = EXCLUDED.until_at`,
      [inv.from_user_id, inv.to_user_id, new Date(Date.now() + REJECT_COOLDOWN_MS).toISOString()]
    );
    return { accepted: false };
  }

  const [user_a, user_b] = pairKey(inv.from_user_id, inv.to_user_id);
  await db.query(
    `INSERT INTO cp_relationships (user_a, user_b, ring_id, started_at, status)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'active')`,
    [user_a, user_b, inv.ring_id]
  );
  await db.query(
    `UPDATE cp_invitations SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
    [inviteId]
  );
  return { accepted: true };
}

async function returnRingToBag(userId, ringId) {
  await db.query(
    `INSERT INTO cp_user_rings (user_id, ring_id, quantity, updated_at)
     VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, ring_id)
     DO UPDATE SET quantity = cp_user_rings.quantity + 1, updated_at = CURRENT_TIMESTAMP`,
    [userId, ringId]
  );
}

async function breakUp(userId, { forced = false } = {}) {
  const cp = await getActiveCp(userId);
  if (!cp) throw new Error('No active CP relationship');
  const [user_a, user_b] = pairKey(userId, cp.partnerId);
  await db.query(
    `UPDATE cp_relationships SET status = 'ended' WHERE user_a = $1 AND user_b = $2 AND status = 'active'`,
    [user_a, user_b]
  );
  return { ok: true, forced };
}

async function changeRing(userId, ringId) {
  const cp = await getActiveCp(userId);
  if (!cp) throw new Error('No CP relationship');
  const qty = await getUserRingQty(userId, ringId);
  if (qty < 1) throw new Error('You do not own this ring');
  const [user_a, user_b] = pairKey(userId, cp.partnerId);
  await db.query(`UPDATE cp_relationships SET ring_id = $3 WHERE user_a = $1 AND user_b = $2 AND status = 'active'`, [
    user_a,
    user_b,
    ringId,
  ]);
  await db.query(
    `UPDATE cp_user_rings SET quantity = quantity - 1 WHERE user_id = $1 AND ring_id = $2 AND quantity > 0`,
    [userId, ringId]
  );
  return ringById(ringId);
}

async function listPendingInvites(userId) {
  const res = await db.query(
    `SELECT i.*, u.first_name, u.last_name, u.profile_pic
     FROM cp_invitations i
     JOIN users u ON u.id = i.from_user_id
     WHERE i.to_user_id = $1 AND i.status = 'pending' AND i.expires_at > NOW()
     ORDER BY i.created_at DESC`,
    [userId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    fromUserId: String(r.from_user_id),
    fromName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'User',
    fromPic: r.profile_pic,
    ringId: r.ring_id,
    ring: ringById(r.ring_id),
    expiresAt: r.expires_at,
  }));
}

async function getPersonalLevel(userId) {
  const gifts = await db.query(
    `SELECT COALESCE(SUM(coin_amount::bigint), 0)::bigint AS spent
     FROM gift_transactions WHERE sender_id = $1`,
    [userId]
  );
  const spent = Number(gifts.rows[0]?.spent || 0);
  const exp = Math.floor(spent / 25);
  let level = 1;
  let need = 1000;
  let cur = exp;
  while (cur >= need && level < 99) {
    cur -= need;
    level += 1;
    need = Math.floor(need * 1.15);
  }
  return { level, exp, nextLevelExp: need, progress: cur };
}

async function getRoomLevel(userId) {
  const hostRooms = await db.query(
    `SELECT id FROM live_rooms WHERE host_user_id = $1 AND room_type = 'party' ORDER BY updated_at DESC LIMIT 1`,
    [userId]
  );
  const roomId = hostRooms.rows[0]?.id;
  if (!roomId) return { level: 1, exp: 0, nextLevelExp: 1000, progress: 0 };
  const gifts = await db.query(
    `SELECT COALESCE(SUM(coin_amount::bigint), 0)::bigint AS total
     FROM gift_transactions WHERE live_room_id = $1`,
    [roomId]
  );
  const exp = Math.floor(Number(gifts.rows[0]?.total || 0) / 10);
  let level = 1;
  let need = 2000;
  let cur = exp;
  while (cur >= need && level < 99) {
    cur -= need;
    level += 1;
    need = Math.floor(need * 1.12);
  }
  return { level, exp, nextLevelExp: need, progress: cur, roomId };
}

module.exports = {
  CP_SUPPORT_UNLOCK,
  CP_SUPPORT_INVITE,
  INTIMACY_DISPLAY_MULT,
  INTIMACY_INVITE_MIN,
  CP_RINGS,
  addSupportPoints,
  getSupportPoints,
  getActiveCp,
  listRings,
  purchaseRing,
  sendInvite,
  respondInvite,
  breakUp,
  changeRing,
  listPendingInvites,
  getPersonalLevel,
  getRoomLevel,
  getUserRingQty,
  listUserOwnedRings,
  userHasAnyRing,
  lookupUserForInvite,
  getCpPairsInRoom,
};
