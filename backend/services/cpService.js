const db = require('../config/database');
const followService = require('./followService');
const walletService = require('./walletService');

const cpLevelService = require('./cpLevelService');

const CP_SUPPORT_UNLOCK = 20000;
const CP_SUPPORT_INVITE = 50000;
const INTIMACY_DISPLAY_MULT = 1;
const INTIMACY_INVITE_MIN = CP_SUPPORT_INVITE;
const CP_INVITES_PER_DAY = 3;
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const REJECT_COOLDOWN_MS = 48 * 60 * 60 * 1000;
const CP_BREAK_INSTANT_FEE = 75000;
const CP_INACTIVE_DAYS = 30;
const CP_ACTION_TTL_MS = 48 * 60 * 60 * 1000;

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
  const intimacy = await getSupportPoints(uid, partnerId);
  const levelProgress = cpLevelService.getLevelProgress(intimacy);
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
    intimacy,
    intimacyValue: intimacy * INTIMACY_DISPLAY_MULT,
    cpLevel: levelProgress.level,
    cpLevelProgress: levelProgress,
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
  setImmediate(() => {
    try {
      require('./systemMessageService')
        .notifyCpRingPurchased({ userId, ringId })
        .catch(() => {});
    } catch (_e) {
      /* non-fatal */
    }
  });
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
            ub.first_name AS b_fn, ub.last_name AS b_ln, ub.profile_pic AS b_pic, ub.display_id AS b_did,
            COALESCE(s.points, 0)::int AS intimacy
     FROM cp_relationships r
     JOIN users ua ON ua.id = r.user_a
     JOIN users ub ON ub.id = r.user_b
     LEFT JOIN user_cp_support s
       ON (s.user_a = r.user_a AND s.user_b = r.user_b)
       OR (s.user_a = r.user_b AND s.user_b = r.user_a)
     WHERE r.status = 'active'
       AND r.user_a::text = ANY($1::text[])
       AND r.user_b::text = ANY($1::text[])`,
    [ids]
  );
  return res.rows.map((row) => {
      const intimacy = Number(row.intimacy || 0);
      const levelProgress = cpLevelService.getLevelProgress(intimacy);
      return {
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
        ringId: row.ring_id,
        ring: ringById(row.ring_id),
        cpLevel: levelProgress.level,
        intimacy,
      };
    });
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

  const sentToday = await db.query(
    `SELECT COUNT(*)::int AS n FROM cp_invitations
     WHERE from_user_id = $1 AND created_at >= date_trunc('day', NOW())`,
    [fromUserId]
  );
  if (Number(sentToday.rows[0]?.n || 0) >= CP_INVITES_PER_DAY) {
    throw new Error(`You can only send ${CP_INVITES_PER_DAY} CP invitations per day`);
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

  const invite = res.rows[0];
  setImmediate(() => {
    try {
      const { cpQuoteLine } = require('./cpQuotes');
      const { buildCpInviteMessage, sendCpDirectMessage } = require('./cpChatMessages');
      const ring = ringById(ringId);
      db.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [fromUserId])
        .then((nameRes) => {
          const u = nameRes.rows[0];
          const fromName = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User' : 'User';
          const body = buildCpInviteMessage({
            fromName,
            inviteId: invite.id,
            ringId,
            ringName: ring?.name,
            ringEmoji: ring?.emoji,
            quoteLine: cpQuoteLine('invitation_received'),
          });
          return sendCpDirectMessage(fromUserId, toUserId, body);
        })
        .catch(() => {});
      const systemMessageService = require('./systemMessageService');
      systemMessageService
        .notifyCpInviteSent({
          fromUserId,
          toUserId,
          ringId,
          inviteId: invite.id,
        })
        .catch(() => {});
    } catch (_e) {
      /* non-fatal */
    }
  });

  return invite;
}

async function getActiveCpPartnerId(userId, client = db) {
  const q = client.query ? client.query.bind(client) : db.query;
  const res = await q(
    `SELECT CASE WHEN r.user_a = $1 THEN r.user_b ELSE r.user_a END AS partner_id
     FROM cp_relationships r
     WHERE (r.user_a = $1 OR r.user_b = $1) AND r.status = 'active'
     LIMIT 1`,
    [String(userId)]
  );
  return res.rows[0]?.partner_id ? String(res.rows[0].partner_id) : null;
}

async function upsertActiveCpRelationship(userId, partnerId, ringId, client = db) {
  const q = client.query ? client.query.bind(client) : db.query;
  const [user_a, user_b] = pairKey(userId, partnerId);
  await q(
    `INSERT INTO cp_relationships (user_a, user_b, ring_id, started_at, status)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'active')
     ON CONFLICT (user_a, user_b)
     DO UPDATE SET
       ring_id = EXCLUDED.ring_id,
       started_at = CURRENT_TIMESTAMP,
       status = 'active'`,
    [user_a, user_b, ringId]
  );
}

async function respondInvite(userId, inviteId, accept) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(`SELECT * FROM cp_invitations WHERE id = $1 FOR UPDATE`, [inviteId]);
    const inv = res.rows[0];
    if (!inv) throw new Error('Invitation not found');
    if (String(inv.to_user_id) !== String(userId)) throw new Error('Not your invitation');
    if (inv.status !== 'pending') throw new Error('Invitation already handled');
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await client.query(`UPDATE cp_invitations SET status = 'expired', responded_at = NOW() WHERE id = $1`, [
        inviteId,
      ]);
      await client.query('COMMIT');
      await returnRingToBag(inv.from_user_id, inv.ring_id);
      throw new Error('Invitation expired');
    }

    if (!accept) {
      await client.query(
        `UPDATE cp_invitations SET status = 'rejected', responded_at = NOW() WHERE id = $1`,
        [inviteId]
      );
      await client.query(
        `INSERT INTO cp_invite_cooldowns (from_user_id, to_user_id, until_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET until_at = EXCLUDED.until_at`,
        [inv.from_user_id, inv.to_user_id, new Date(Date.now() + REJECT_COOLDOWN_MS).toISOString()]
      );
      await client.query('COMMIT');
      await returnRingToBag(inv.from_user_id, inv.ring_id);
      setImmediate(() => {
        try {
          require('./systemMessageService')
            .notifyCpInviteDeclined({
              inviterId: inv.from_user_id,
              declinerId: inv.to_user_id,
              ringId: inv.ring_id,
            })
            .catch(() => {});
        } catch (_e) {
          /* non-fatal */
        }
      });
      return { accepted: false };
    }

    const inviterPartner = await getActiveCpPartnerId(inv.from_user_id, client);
    const accepterPartner = await getActiveCpPartnerId(inv.to_user_id, client);
    if (inviterPartner && inviterPartner !== String(inv.to_user_id)) {
      throw new Error('Inviter already has a CP partner');
    }
    if (accepterPartner && accepterPartner !== String(inv.from_user_id)) {
      throw new Error('You already have a CP partner');
    }

    await upsertActiveCpRelationship(inv.from_user_id, inv.to_user_id, inv.ring_id, client);
    await client.query(
      `UPDATE cp_invitations SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [inviteId]
    );
    await client.query('COMMIT');

    setImmediate(() => {
      try {
        require('./systemMessageService')
          .notifyCpInviteAccepted({
            inviterId: inv.from_user_id,
            accepterId: inv.to_user_id,
            ringId: inv.ring_id,
          })
          .catch(() => {});
      } catch (_e) {
        /* non-fatal */
      }
    });
    return { accepted: true };
  } catch (err) {
    await db.safeRollback(client);
    const msg = String(err.message || '');
    if (/duplicate key|unique constraint|cp_relationships/i.test(msg)) {
      throw new Error('Could not accept — you may already be CP. Refresh CP House and check your status.');
    }
    throw err;
  } finally {
    client.release();
  }
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

async function partnerLastActive(partnerId) {
  const res = await db.query(
    `SELECT COALESCE(last_login, updated_at, created_at) AS ts FROM users WHERE id = $1`,
    [partnerId]
  );
  return res.rows[0]?.ts ? new Date(res.rows[0].ts) : null;
}

async function isPartnerInactive(partnerId) {
  const ts = await partnerLastActive(partnerId);
  if (!ts) return true;
  return Date.now() - ts.getTime() > CP_INACTIVE_DAYS * 86400000;
}

async function endCpRelationship(userId, partnerId, meta = {}) {
  const [user_a, user_b] = pairKey(userId, partnerId);
  await db.query(
    `UPDATE cp_relationships SET status = 'ended' WHERE user_a = $1 AND user_b = $2 AND status = 'active'`,
    [user_a, user_b]
  );
  await db.query(
    `UPDATE cp_action_requests SET status = 'cancelled', responded_at = NOW()
     WHERE status = 'pending' AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))`,
    [userId, partnerId]
  );
  setImmediate(() => {
    try {
      require('./systemMessageService')
        .notifyCpBreakUp({
          initiatorId: userId,
          partnerId,
          instant: Boolean(meta.instant),
          penalty: Boolean(meta.penalty),
        })
        .catch(() => {});
    } catch (_e) {
      /* non-fatal */
    }
  });
}

async function applyRingChange(userId, ringId) {
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
  const ring = ringById(ringId);
  setImmediate(() => {
    try {
      require('./systemMessageService')
        .notifyCpRingChanged({
          changerId: userId,
          partnerId: cp.partnerId,
          ringId,
        })
        .catch(() => {});
    } catch (_e) {
      /* non-fatal */
    }
  });
  return ring;
}

async function listActionRequests(userId) {
  const res = await db.query(
    `SELECT r.*,
            fu.first_name AS f_fn, fu.last_name AS f_ln,
            tu.first_name AS t_fn, tu.last_name AS t_ln
     FROM cp_action_requests r
     JOIN users fu ON fu.id = r.from_user_id
     JOIN users tu ON tu.id = r.to_user_id
     WHERE r.status = 'pending' AND r.expires_at > NOW()
       AND (r.from_user_id = $1 OR r.to_user_id = $1)
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    type: r.type,
    fromUserId: String(r.from_user_id),
    toUserId: String(r.to_user_id),
    fromName: `${r.f_fn || ''} ${r.f_ln || ''}`.trim() || 'User',
    toName: `${r.t_fn || ''} ${r.t_ln || ''}`.trim() || 'User',
    newRingId: r.new_ring_id,
    newRing: r.new_ring_id ? ringById(r.new_ring_id) : null,
    expiresAt: r.expires_at,
    incoming: String(r.to_user_id) === String(userId),
  }));
}

async function requestBreakUp(userId) {
  const cp = await getActiveCp(userId);
  if (!cp) throw new Error('No active CP relationship');
  const dup = await db.query(
    `SELECT id FROM cp_action_requests
     WHERE from_user_id = $1 AND type = 'break' AND status = 'pending' AND expires_at > NOW()`,
    [userId]
  );
  if (dup.rows[0]) throw new Error('Break-up request already pending');
  const expires = new Date(Date.now() + CP_ACTION_TTL_MS);
  const res = await db.query(
    `INSERT INTO cp_action_requests (from_user_id, to_user_id, type, status, expires_at)
     VALUES ($1, $2, 'break', 'pending', $3) RETURNING *`,
    [userId, cp.partnerId, expires.toISOString()]
  );
  const row = res.rows[0];
  setImmediate(() => {
    try {
      const { cpQuoteLine } = require('./cpQuotes');
      const { buildCpActionMessage, sendCpDirectMessage } = require('./cpChatMessages');
      db.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [userId])
        .then((nameRes) => {
          const u = nameRes.rows[0];
          const fromName = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User' : 'User';
          const body = buildCpActionMessage({
            fromName,
            actionId: row.id,
            type: 'break',
            quoteLine: cpQuoteLine('removal_request'),
          });
          return sendCpDirectMessage(userId, cp.partnerId, body);
        })
        .catch(() => {});
      require('./systemMessageService')
        .notifyCpBreakRequest({ fromUserId: userId, toUserId: cp.partnerId, actionId: row.id })
        .catch(() => {});
    } catch (_e) {
      /* non-fatal */
    }
  });
  return { id: row.id, expiresAt: row.expires_at };
}

async function instantBreakUp(userId) {
  const cp = await getActiveCp(userId);
  if (!cp) throw new Error('No active CP relationship');
  await walletService.debitCoins(userId, CP_BREAK_INSTANT_FEE, {
    type: 'cp_break_instant',
    metadata: { partner_id: cp.partnerId },
  });
  await endCpRelationship(userId, cp.partnerId, { instant: true });
  return { ok: true, fee: CP_BREAK_INSTANT_FEE };
}

async function penaltyBreakUp(userId) {
  const cp = await getActiveCp(userId);
  if (!cp) throw new Error('No active CP relationship');
  if (!(await isPartnerInactive(cp.partnerId))) {
    throw new Error(`Partner was active within ${CP_INACTIVE_DAYS} days — use consent or pay ${CP_BREAK_INSTANT_FEE.toLocaleString()} coins`);
  }
  await walletService.debitCoins(userId, CP_BREAK_INSTANT_FEE, {
    type: 'cp_break_penalty',
    metadata: { partner_id: cp.partnerId, inactive: true },
  });
  await endCpRelationship(userId, cp.partnerId, { penalty: true });
  return { ok: true, fee: CP_BREAK_INSTANT_FEE, penalty: true };
}

async function requestRingChange(userId, ringId) {
  const cp = await getActiveCp(userId);
  if (!cp) throw new Error('No active CP relationship');
  const ring = ringById(ringId);
  if (!ring) throw new Error('Ring not found');
  const qty = await getUserRingQty(userId, ringId);
  if (qty < 1) throw new Error('You do not own this ring');
  const dup = await db.query(
    `SELECT id FROM cp_action_requests
     WHERE from_user_id = $1 AND type = 'ring_change' AND status = 'pending' AND expires_at > NOW()`,
    [userId]
  );
  if (dup.rows[0]) throw new Error('Ring change request already pending');
  const expires = new Date(Date.now() + CP_ACTION_TTL_MS);
  const res = await db.query(
    `INSERT INTO cp_action_requests (from_user_id, to_user_id, type, new_ring_id, status, expires_at)
     VALUES ($1, $2, 'ring_change', $3, 'pending', $4) RETURNING *`,
    [userId, cp.partnerId, ringId, expires.toISOString()]
  );
  const row = res.rows[0];
  setImmediate(() => {
    try {
      const { cpQuoteLine } = require('./cpQuotes');
      const { buildCpActionMessage, sendCpDirectMessage } = require('./cpChatMessages');
      db.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [userId])
        .then((nameRes) => {
          const u = nameRes.rows[0];
          const fromName = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User' : 'User';
          const body = buildCpActionMessage({
            fromName,
            actionId: row.id,
            type: 'ring_change',
            ringId,
            ringName: ring.name,
            ringEmoji: ring.emoji,
            quoteLine: cpQuoteLine('ring_change_request'),
          });
          return sendCpDirectMessage(userId, cp.partnerId, body);
        })
        .catch(() => {});
      require('./systemMessageService')
        .notifyCpRingChangeRequest({
          fromUserId: userId,
          toUserId: cp.partnerId,
          ringId,
          actionId: row.id,
        })
        .catch(() => {});
    } catch (_e) {
      /* non-fatal */
    }
  });
  return { id: row.id, ring, expiresAt: row.expires_at };
}

async function respondActionRequest(userId, requestId, accept) {
  const res = await db.query(
    `SELECT * FROM cp_action_requests
     WHERE id = $1 AND to_user_id = $2 AND status = 'pending' AND expires_at > NOW()`,
    [requestId, userId]
  );
  const req = res.rows[0];
  if (!req) throw new Error('Request not found or expired');

  if (!accept) {
    await db.query(`UPDATE cp_action_requests SET status = 'declined', responded_at = NOW() WHERE id = $1`, [
      requestId,
    ]);
    setImmediate(() => {
      try {
        require('./systemMessageService')
          .notifyCpActionDeclined({
            fromUserId: req.from_user_id,
            toUserId: req.to_user_id,
            type: req.type,
          })
          .catch(() => {});
      } catch (_e) {
        /* non-fatal */
      }
    });
    return { accepted: false, type: req.type };
  }

  if (req.type === 'break') {
    await endCpRelationship(req.from_user_id, req.to_user_id);
  } else if (req.type === 'ring_change') {
    await applyRingChange(req.from_user_id, req.new_ring_id);
  } else {
    throw new Error('Unknown request type');
  }

  await db.query(`UPDATE cp_action_requests SET status = 'accepted', responded_at = NOW() WHERE id = $1`, [
    requestId,
  ]);

  if (req.type === 'ring_change') {
    setImmediate(() => {
      try {
        require('./systemMessageService')
          .notifyCpRingChangeAccepted({
            fromUserId: req.from_user_id,
            toUserId: req.to_user_id,
            ringId: req.new_ring_id,
          })
          .catch(() => {});
      } catch (_e) {
        /* non-fatal */
      }
    });
  }

  return { accepted: true, type: req.type };
}

async function breakUp(userId, { forced = false, instant = false, penalty = false } = {}) {
  if (instant) return instantBreakUp(userId);
  if (penalty) return penaltyBreakUp(userId);
  if (forced) {
    const cp = await getActiveCp(userId);
    if (!cp) throw new Error('No active CP relationship');
    await endCpRelationship(userId, cp.partnerId, { forced: true });
    return { ok: true, forced: true };
  }
  return requestBreakUp(userId);
}

async function changeRing(userId, ringId) {
  return requestRingChange(userId, ringId);
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

async function getCpProfilePublic(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const cp = await getActiveCp(uid);
  if (!cp) return null;
  const meRes = await db.query(
    `SELECT id, first_name, last_name, profile_pic, display_id FROM users WHERE id = $1`,
    [uid]
  );
  const u = meRes.rows[0];
  if (!u) return null;
  return {
    user: {
      userId: String(u.id),
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'User',
      profilePic: u.profile_pic || null,
      displayId: u.display_id != null ? String(u.display_id) : null,
    },
    partner: {
      userId: cp.partnerId,
      name: cp.partnerName,
      profilePic: cp.partnerPic,
      displayId: cp.partnerDisplayId != null ? String(cp.partnerDisplayId) : null,
    },
    ringId: cp.ringId,
    ring: cp.ring,
    daysTogether: cp.daysTogether,
    startedAt: cp.startedAt,
    intimacy: cp.intimacy,
    intimacyValue: cp.intimacyValue,
    cpLevel: cp.cpLevel,
    cpLevelProgress: cp.cpLevelProgress,
  };
}

function getCpRules() {
  return cpLevelService.getRulesPayload({
    intimacyInviteMin: INTIMACY_INVITE_MIN,
    intimacyUnlock: CP_SUPPORT_UNLOCK,
    invitesPerDay: CP_INVITES_PER_DAY,
    breakInstantFee: CP_BREAK_INSTANT_FEE,
    inactiveDays: CP_INACTIVE_DAYS,
    intimacyPerDiamond: 1,
  });
}

async function coupleWeekIntimacy(userA, userB) {
  const res = await db.query(
    `SELECT COALESCE(SUM(gt.coin_amount), 0)::bigint AS intimacy
     FROM cp_relationships r
     LEFT JOIN gift_transactions gt ON (
       (gt.sender_id = r.user_a AND gt.receiver_id = r.user_b)
       OR (gt.sender_id = r.user_b AND gt.receiver_id = r.user_a)
     )
     AND gt.created_at >= GREATEST(r.started_at, NOW() - INTERVAL '7 days')
     WHERE r.status = 'active' AND r.user_a = $1 AND r.user_b = $2`,
    [userA, userB]
  );
  return Number(res.rows[0]?.intimacy || 0);
}

async function coupleRankPosition(userA, userB, period, intimacy) {
  if (period === 'week') {
    const res = await db.query(
      `SELECT COUNT(*)::int + 1 AS rank
       FROM (
         SELECT r.user_a, r.user_b, COALESCE(SUM(gt.coin_amount), 0)::bigint AS score
         FROM cp_relationships r
         LEFT JOIN gift_transactions gt ON (
           (gt.sender_id = r.user_a AND gt.receiver_id = r.user_b)
           OR (gt.sender_id = r.user_b AND gt.receiver_id = r.user_a)
         )
         AND gt.created_at >= GREATEST(r.started_at, NOW() - INTERVAL '7 days')
         WHERE r.status = 'active'
         GROUP BY r.user_a, r.user_b
         HAVING COALESCE(SUM(gt.coin_amount), 0) > $3
       ) ranked`,
      [userA, userB, intimacy]
    );
    return Number(res.rows[0]?.rank || 0) || null;
  }
  const res = await db.query(
    `SELECT COUNT(*)::int + 1 AS rank
     FROM cp_relationships r
     LEFT JOIN user_cp_support s ON s.user_a = r.user_a AND s.user_b = r.user_b
     WHERE r.status = 'active'
       AND COALESCE(s.points, 0) * $1 > $2`,
    [INTIMACY_DISPLAY_MULT, intimacy]
  );
  return Number(res.rows[0]?.rank || 0) || null;
}

function mapCpRankRow(row, rank) {
  return {
    rank,
    intimacy: Number(row.intimacy || 0),
    ringId: row.ring_id,
    userA: {
      userId: String(row.user_a),
      name: `${row.a_fn || ''} ${row.a_ln || ''}`.trim() || 'User',
      profilePic: row.a_pic || null,
    },
    userB: {
      userId: String(row.user_b),
      name: `${row.b_fn || ''} ${row.b_ln || ''}`.trim() || 'User',
      profilePic: row.b_pic || null,
    },
  };
}

async function getCpRankings(viewerUserId, period = 'week', limit = 50) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const isWeek = period === 'week';
  let rows;

  if (isWeek) {
    const res = await db.query(
      `SELECT r.user_a, r.user_b, r.ring_id,
              ua.first_name AS a_fn, ua.last_name AS a_ln, ua.profile_pic AS a_pic,
              ub.first_name AS b_fn, ub.last_name AS b_ln, ub.profile_pic AS b_pic,
              COALESCE(SUM(gt.coin_amount), 0)::bigint AS intimacy
       FROM cp_relationships r
       JOIN users ua ON ua.id = r.user_a AND ua.is_active = TRUE
       JOIN users ub ON ub.id = r.user_b AND ub.is_active = TRUE
       LEFT JOIN gift_transactions gt ON (
         (gt.sender_id = r.user_a AND gt.receiver_id = r.user_b)
         OR (gt.sender_id = r.user_b AND gt.receiver_id = r.user_a)
       )
       AND gt.created_at >= GREATEST(r.started_at, NOW() - INTERVAL '7 days')
       WHERE r.status = 'active'
       GROUP BY r.user_a, r.user_b, r.ring_id, r.started_at,
                ua.first_name, ua.last_name, ua.profile_pic,
                ub.first_name, ub.last_name, ub.profile_pic
       ORDER BY intimacy DESC, r.started_at ASC
       LIMIT $1`,
      [lim]
    );
    rows = res.rows;
  } else {
    const res = await db.query(
      `SELECT r.user_a, r.user_b, r.ring_id,
              ua.first_name AS a_fn, ua.last_name AS a_ln, ua.profile_pic AS a_pic,
              ub.first_name AS b_fn, ub.last_name AS b_ln, ub.profile_pic AS b_pic,
              (COALESCE(s.points, 0) * $2)::bigint AS intimacy
       FROM cp_relationships r
       JOIN users ua ON ua.id = r.user_a AND ua.is_active = TRUE
       JOIN users ub ON ub.id = r.user_b AND ub.is_active = TRUE
       LEFT JOIN user_cp_support s ON s.user_a = r.user_a AND s.user_b = r.user_b
       WHERE r.status = 'active'
       ORDER BY intimacy DESC, r.started_at ASC
       LIMIT $1`,
      [lim, INTIMACY_DISPLAY_MULT]
    );
    rows = res.rows;
  }

  const rankings = rows.map((row, i) => mapCpRankRow(row, i + 1));

  let myStatus = null;
  const uid = viewerUserId ? String(viewerUserId) : null;
  if (uid) {
    const cp = await getActiveCp(uid);
    const meRes = await db.query(
      `SELECT id, first_name, last_name, profile_pic FROM users WHERE id = $1`,
      [uid]
    );
    const me = meRes.rows[0];
    if (me) {
      const meUser = {
        userId: uid,
        name: `${me.first_name || ''} ${me.last_name || ''}`.trim() || 'User',
        profilePic: me.profile_pic || null,
      };
      if (cp) {
        const [ua, ub] = pairKey(uid, cp.partnerId);
        const inList = rankings.find(
          (r) =>
            (r.userA.userId === ua && r.userB.userId === ub) ||
            (r.userA.userId === ub && r.userB.userId === ua)
        );
        let intimacy = inList?.intimacy ?? 0;
        let rank = inList?.rank ?? null;
        if (!inList) {
          intimacy = isWeek
            ? await coupleWeekIntimacy(ua, ub)
            : (await getSupportPoints(ua, ub)) * INTIMACY_DISPLAY_MULT;
          rank = await coupleRankPosition(ua, ub, isWeek ? 'week' : 'total', intimacy);
        }
        myStatus = {
          hasCp: true,
          user: meUser,
          partner: {
            userId: cp.partnerId,
            name: cp.partnerName,
            profilePic: cp.partnerPic,
          },
          ringId: cp.ringId,
          rank,
          intimacy,
        };
      } else {
        myStatus = { hasCp: false, user: meUser };
      }
    }
  }

  return {
    period: isWeek ? 'week' : 'total',
    intimacyDisplayMult: INTIMACY_DISPLAY_MULT,
    rankings,
    myStatus,
  };
}

module.exports = {
  CP_SUPPORT_UNLOCK,
  CP_SUPPORT_INVITE,
  INTIMACY_DISPLAY_MULT,
  INTIMACY_INVITE_MIN,
  CP_RINGS,
  CP_BREAK_INSTANT_FEE,
  CP_INACTIVE_DAYS,
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
  getCpProfilePublic,
  listActionRequests,
  respondActionRequest,
  isPartnerInactive,
  requestBreakUp,
  instantBreakUp,
  penaltyBreakUp,
  requestRingChange,
  getCpRankings,
  getCpRules,
  CP_INVITES_PER_DAY,
};
