const db = require('../config/database');
const redis = require('../lib/redis');

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
  await redis.del(`lb:${periodType}:${key}:${category}`);
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
  await redis.del(`lb:${periodType}:${key}:${category}`);
}

async function getLeaderboard(periodType, category, limit = 50) {
  const key = periodKey(periodType);
  const cacheKey = `lb:${periodType}:${key}:${category}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const res = await db.query(
    `SELECT entity_id, entity_label, score, rank, metadata, updated_at
     FROM leaderboard_entries
     WHERE period_type = $1 AND period_key = $2 AND category = $3
     ORDER BY score DESC, updated_at ASC LIMIT $4`,
    [periodType, key, category, limit]
  );
  await redis.set(cacheKey, JSON.stringify(res.rows), CACHE_TTL);
  return res.rows;
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
  upsertScore,
  refreshRanks,
  getLeaderboard,
  refreshAll,
  ingestGiftLeaderboards,
};
