const db = require('../config/database');
const { toJsonb } = require('../lib/pgJsonb');

const DAILY_CAPS = {
  join_room: { coins: 50, max: 5 },
  speak_minute: { coins: 30, max: 60 },
  send_gift: { coins: 0, max: 20 },
  receive_gift: { coins: 0, max: 20 },
  daily_login: { coins: 25, max: 1 },
};

const REWARD_TABLE = {
  join_room: { coins: 10, xp: 5 },
  /* Gifts must not rebate spendable coins — that made deductions look broken */
  send_gift: { coins: 0, xp: 3 },
  receive_gift: { coins: 0, xp: 4 },
  speak_session: { coins: 15, xp: 10 },
  stay_active: { coins: 12, xp: 6 },
};

async function countToday(userId, activityType) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS c FROM party_activity_log
     WHERE user_id = $1 AND activity_type = $2 AND created_at >= CURRENT_DATE`,
    [userId, activityType]
  );
  return res.rows[0]?.c || 0;
}

async function recordActivity(userId, activityType, { liveRoomId = null, metadata = {} } = {}) {
  const reward = REWARD_TABLE[activityType];
  if (!reward) return null;
  const cap = DAILY_CAPS[activityType];
  if (cap) {
    const count = await countToday(userId, activityType);
    if (count >= cap.max) return null;
  }
  const coins = reward.coins || 0;
  const xp = reward.xp || 0;
  const res = await db.query(
    `INSERT INTO party_activity_log (user_id, live_room_id, activity_type, coins_awarded, xp_awarded, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *`,
    [userId, liveRoomId, activityType, coins, xp, toJsonb(metadata || {})]
  );
  if (coins > 0) {
    try {
      const walletService = require('./walletService');
      await walletService.creditCoins(userId, coins, {
        type: `party_${activityType}`,
        reference_type: 'party_activity',
        reference_id: res.rows[0]?.id,
        metadata: { activity_type: activityType, ...(metadata || {}) },
      });
    } catch (e) {
      console.warn('[party] activity coin credit', e.message);
    }
  }
  return { coins, xp, activity: res.rows[0] };
}

module.exports = { recordActivity, REWARD_TABLE };
