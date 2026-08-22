const db = require('../config/database');
const redis = require('../lib/redis');

/* Temporary leaderboard hiding for gifting/fraud prevention during heavy gifting.
   Works for the “Gift Rank” tab (category = gifters). */
const HIDDEN_LEADERBOARD_DISPLAY_IDS = ['4830223'];

const CACHE_TTL = 300;

function periodKey(type, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  if (type === 'daily') return `${y}-${m}-${d}`;
  if (type === 'weekly') {
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const week = Math.ceil(((date - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  }
  return `${y}-${m}`;
}

function periodSince(periodType, date = new Date()) {
  if (periodType === 'daily') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  if (periodType === 'weekly') {
    const since = new Date(date);
    since.setUTCDate(since.getUTCDate() - 7);
    return since;
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function displayName(user) {
  if (!user) return null;
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return name || null;
}

async function enrichLeaderboardRows(rows) {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map((r) => String(r.entity_id)).filter(Boolean))];
  if (!ids.length) return rows;
  const users = await db.query(
    `SELECT id, first_name, last_name, profile_pic FROM users WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
    [ids]
  );
  const map = new Map(users.rows.map((u) => [String(u.id), u]));
  return rows.map((row, i) => {
    const user = map.get(String(row.entity_id));
    return {
      ...row,
      entity_label: displayName(user) || row.entity_label || 'User',
      profile_pic: user?.profile_pic || row.profile_pic || null,
      rank: row.rank || i + 1,
    };
  });
}

async function filterHiddenLeaderboardRows(rows) {
  if (!rows.length || !HIDDEN_LEADERBOARD_DISPLAY_IDS.length) return rows;
  const ids = [...new Set(rows.map((r) => String(r.entity_id)).filter(Boolean))];
  if (!ids.length) return rows;
  const users = await db.query(
    `SELECT id, display_id FROM users WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const hiddenIds = new Set(
    users.rows
      .filter((u) => HIDDEN_LEADERBOARD_DISPLAY_IDS.includes(String(u.display_id || '')))
      .map((u) => String(u.id))
  );
  return rows.filter((r) => !hiddenIds.has(String(r.entity_id)));
}

async function computeEngagementLeaderboard(periodType, category, limit = 50, opts = {}) {
  const since = periodSince(periodType);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  let res;

  if (category === 'video') {
    /* social_post_likes has composite PK (post_id, user_id) — no spl.id column */
    res = await db.query(
      `SELECT sp.user_id AS entity_id,
              (COUNT(DISTINCT sp.id) * 10
               + COUNT(spl.user_id) * 2
               + COUNT(DISTINCT spc.id) * 3)::bigint AS score,
              TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS entity_label,
              u.profile_pic
       FROM social_posts sp
       JOIN users u ON u.id = sp.user_id AND u.is_active = TRUE
       LEFT JOIN social_post_likes spl ON spl.post_id = sp.id
       LEFT JOIN social_post_comments spc ON spc.post_id = sp.id
       WHERE sp.created_at >= $1
       GROUP BY sp.user_id, u.first_name, u.last_name, u.profile_pic
       HAVING COUNT(DISTINCT sp.id) > 0
       ORDER BY score DESC, entity_label ASC
       LIMIT $2`,
      [since, lim]
    );
  } else if (category === 'gifters') {
    const scoreExpr = opts.mode === 'count' ? 'COUNT(*)::bigint' : 'COALESCE(SUM(gt.coin_amount), 0)::bigint';
    res = await db.query(
      `SELECT gt.sender_id AS entity_id,
              ${scoreExpr} AS score,
              TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS entity_label,
              u.profile_pic
       FROM gift_transactions gt
       JOIN users u ON u.id = gt.sender_id AND u.is_active = TRUE
       WHERE gt.created_at >= $1
         AND u.display_id::text <> ALL($3::text[])
       GROUP BY gt.sender_id, u.first_name, u.last_name, u.profile_pic
       HAVING ${opts.mode === 'count' ? 'COUNT(*) > 0' : 'COALESCE(SUM(gt.coin_amount), 0) > 0'}
       ORDER BY score DESC, entity_label ASC
       LIMIT $2`,
      [since, lim, HIDDEN_LEADERBOARD_DISPLAY_IDS]
    );
  } else if (category === 'creators' || category === 'earners') {
    res = await db.query(
      `WITH gift_scores AS (
         SELECT gt.receiver_id AS user_id, COALESCE(SUM(gt.creator_amount), 0)::bigint AS gift_score
         FROM gift_transactions gt
         WHERE gt.created_at >= $1
         GROUP BY gt.receiver_id
       ),
       live_scores AS (
         SELECT lr.host_user_id AS user_id,
                COALESCE(SUM(
                  GREATEST(
                    EXTRACT(EPOCH FROM (COALESCE(lr.ended_at, CURRENT_TIMESTAMP) - COALESCE(lr.started_at, lr.updated_at))),
                    0
                  ) / 60
                ), 0)::bigint AS live_minutes
         FROM live_rooms lr
         WHERE COALESCE(lr.started_at, lr.updated_at) >= $1
         GROUP BY lr.host_user_id
       ),
       combined AS (
         SELECT u.id AS entity_id,
                (COALESCE(g.gift_score, 0) + COALESCE(l.live_minutes, 0))::bigint AS score,
                TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS entity_label,
                u.profile_pic
         FROM users u
         LEFT JOIN gift_scores g ON g.user_id = u.id
         LEFT JOIN live_scores l ON l.user_id = u.id
         WHERE u.is_active = TRUE
           AND (COALESCE(g.gift_score, 0) + COALESCE(l.live_minutes, 0)) > 0
       )
       SELECT * FROM combined
       ORDER BY score DESC, entity_label ASC
       LIMIT $2`,
      [since, lim]
    );
  } else if (category === 'games') {
    res = await db.query(
      `SELECT gr.user_id AS entity_id,
              COALESCE(SUM(gr.payout_amount), 0)::bigint AS score,
              TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS entity_label,
              u.profile_pic
       FROM game_rounds gr
       JOIN users u ON u.id = gr.user_id AND u.is_active = TRUE
       WHERE gr.payout_amount > 0
         AND gr.created_at >= $1
       GROUP BY gr.user_id, u.first_name, u.last_name, u.profile_pic
       HAVING COALESCE(SUM(gr.payout_amount), 0) > 0
       ORDER BY score DESC, entity_label ASC
       LIMIT $2`,
      [since, lim]
    );
  } else {
    return [];
  }

  return res.rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

async function invalidateLeaderboardCache(periodType, category) {
  const key = periodKey(periodType);
  await redis.del(`lb:${periodType}:${key}:${category}:default`);
  await redis.del(`lb:${periodType}:${key}:${category}:count`);
  await redis.del(`lb:${periodType}:${key}:${category}`);
}

async function upsertScore({ periodType, category, entityId, entityLabel, delta }) {
  const key = periodKey(periodType);
  await db.query(
    `INSERT INTO leaderboard_entries (period_type, period_key, category, entity_id, entity_label, score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (period_type, period_key, category, entity_id)
     DO UPDATE SET score = leaderboard_entries.score + $6,
                   entity_label = COALESCE(EXCLUDED.entity_label, leaderboard_entries.entity_label),
                   updated_at = CURRENT_TIMESTAMP`,
    [periodType, key, category, entityId, entityLabel || null, delta]
  );
  await invalidateLeaderboardCache(periodType, category);
}

async function refreshRanks(periodType, category) {
  const key = periodKey(periodType);
  await db.query(
    `WITH ranked AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC, updated_at ASC) AS r
       FROM leaderboard_entries
       WHERE period_type = $1 AND period_key = $2 AND category = $3
     )
     UPDATE leaderboard_entries le SET rank = ranked.r
     FROM ranked WHERE le.id = ranked.id`,
    [periodType, key, category]
  );
  await invalidateLeaderboardCache(periodType, category);
}

async function getLeaderboard(periodType, category, limit = 50, opts = {}) {
  const key = periodKey(periodType);
  const modeKey = opts.mode || 'default';
  const cacheKey = `lb:${periodType}:${key}:${category}:${modeKey}`;
  if (!opts.viewerId) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn('[leaderboard] cache read skipped:', e.message);
    }
  }

  let rows = [];
  const forceLive = category === 'video' || category === 'games' || opts.mode === 'count';

  if (!forceLive) {
    const res = await db.query(
      `SELECT entity_id, entity_label, score, rank, metadata, updated_at
       FROM leaderboard_entries
       WHERE period_type = $1 AND period_key = $2 AND category = $3
       ORDER BY score DESC, updated_at ASC LIMIT $4`,
      [periodType, key, category, limit]
    );
    rows = res.rows;
  }

  if (!rows.length || forceLive) {
    try {
      const computed = await computeEngagementLeaderboard(periodType, category, limit, opts);
      if (computed.length) rows = computed;
    } catch (err) {
      console.error('[leaderboard] compute failed', category, err.message);
      if (!rows.length) rows = [];
    }
  }

  try {
    rows = await filterHiddenLeaderboardRows(rows);
    rows = await enrichLeaderboardRows(rows);
    if (opts.viewerId) {
      const followService = require('./followService');
      const hidden = await followService.getHiddenUserIdSet(opts.viewerId);
      rows = followService.filterOutHiddenUsers(rows, hidden, ['entity_id']);
    }
  } catch (err) {
    console.error('[leaderboard] enrich failed', err.message);
  }
  /* Don't cache personalized (viewer-filtered) boards */
  if (!opts.viewerId) {
    try {
      await redis.set(cacheKey, JSON.stringify(rows), CACHE_TTL);
    } catch (e) {
      console.warn('[leaderboard] cache write skipped:', e.message);
    }
  }
  return rows;
}

async function refreshAll() {
  const categories = ['creators', 'agencies', 'gifters', 'earners', 'workers'];
  const periods = ['daily', 'weekly', 'monthly'];
  for (const p of periods) {
    for (const c of categories) {
      await refreshRanks(p, c);
    }
  }
}

async function ingestGiftLeaderboards(gift) {
  const amount = Number(gift.coin_amount || 0);
  if (amount <= 0) return;
  const periods = ['daily', 'weekly', 'monthly'];
  for (const p of periods) {
    await upsertScore({ periodType: p, category: 'gifters', entityId: gift.sender_id, delta: amount });
    await upsertScore({ periodType: p, category: 'creators', entityId: gift.receiver_id, delta: Number(gift.creator_amount || amount) });
    await upsertScore({ periodType: p, category: 'earners', entityId: gift.receiver_id, delta: Number(gift.creator_amount || amount) });
  }
}

module.exports = {
  periodKey,
  periodSince,
  upsertScore,
  refreshRanks,
  getLeaderboard,
  computeEngagementLeaderboard,
  refreshAll,
  ingestGiftLeaderboards,
};
