const db = require('../config/database');
const walletService = require('./walletService');
const fraudService = require('./fraudService');
const leaderboardService = require('./leaderboardService');

async function getActiveRules() {
  const res = await db.query(`SELECT * FROM reward_rules WHERE active = true`);
  return res.rows;
}

async function verifyEligibility(userId, rule) {
  const criteria = rule.criteria || {};
  const now = new Date();

  if (rule.rule_type === 'daily') {
    return {
      eventKey: `${rule.slug}:daily:${now.toISOString().slice(0, 10)}`,
      metadata: { period: 'daily', slug: rule.slug },
    };
  }

  if (rule.rule_type === 'weekly') {
    const bucket = leaderboardService.periodKey('weekly', now);
    return {
      eventKey: `${rule.slug}:weekly:${bucket}`,
      metadata: { period: 'weekly', slug: rule.slug },
    };
  }

  if (rule.rule_type === 'monthly') {
    const bucket = leaderboardService.periodKey('monthly', now);
    return {
      eventKey: `${rule.slug}:monthly:${bucket}`,
      metadata: { period: 'monthly', slug: rule.slug },
    };
  }

  if (rule.rule_type === 'hourly' || rule.rule_type === 'quarter_hour') {
    const minMinutes = rule.rule_type === 'quarter_hour' ? 15 : 60;
    const liveRes = await db.query(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(left_at, CURRENT_TIMESTAMP) - joined_at))), 0) AS seconds
       FROM live_room_members
       WHERE user_id = $1 AND joined_at > CURRENT_TIMESTAMP - INTERVAL '2 hours'`,
      [userId]
    );
    const liveSeconds = Number(liveRes.rows[0]?.seconds || 0);
    if (liveSeconds < minMinutes * 60) {
      throw new Error(`Live for at least ${minMinutes} minutes to claim this reward`);
    }
    const bucket = rule.rule_type === 'quarter_hour'
      ? `${now.toISOString().slice(0, 16)}`
      : now.toISOString().slice(0, 13);
    return { eventKey: `${rule.slug}:${rule.rule_type}:${bucket}`, metadata: { live_seconds: liveSeconds } };
  }

  if (rule.rule_type === 'onboarding') {
    const step = criteria.step || 'profile_complete';
    if (step === 'profile_complete') {
      const u = await db.query(`SELECT profile_pic FROM users WHERE id = $1`, [userId]);
      const row = u.rows[0];
      if (!row?.profile_pic) throw new Error('Complete your profile photo first');
    }
    return { eventKey: `onboarding:${step}:${userId}`, metadata: { step } };
  }

  if (rule.rule_type === 'milestone') {
    const minGifts = Number(criteria.min_gifts_sent || 0);
    if (minGifts > 0) {
      const g = await db.query(
        `SELECT COUNT(*)::int AS c FROM gift_transactions WHERE sender_id = $1`,
        [userId]
      );
      if (g.rows[0].c < minGifts) {
        throw new Error(`Send at least ${minGifts} gifts to unlock this reward`);
      }
    }
    return { eventKey: `milestone:${rule.slug}:${userId}`, metadata: criteria };
  }

  throw new Error('Reward rule type not supported for manual claim');
}

async function claimReward(userId, ruleSlug) {
  await fraudService.assertNotBlocked(userId, 'reward_claim');

  const ruleRes = await db.query(`SELECT * FROM reward_rules WHERE slug = $1 AND active = true`, [ruleSlug]);
  const rule = ruleRes.rows[0];
  if (!rule) throw new Error('Reward rule not found');

  const { eventKey, metadata } = await verifyEligibility(userId, rule);

  const dup = await db.query(
    `SELECT 1 FROM reward_events WHERE rule_id = $1 AND user_id = $2 AND event_key = $3`,
    [rule.id, userId, eventKey]
  );
  if (dup.rows.length) throw new Error('Reward already claimed for this period');

  if (rule.cooldown_seconds > 0) {
    const recent = await db.query(
      `SELECT 1 FROM reward_claims WHERE rule_id = $1 AND user_id = $2
       AND claimed_at > CURRENT_TIMESTAMP - ($3 || ' seconds')::interval LIMIT 1`,
      [rule.id, userId, rule.cooldown_seconds]
    );
    if (recent.rows.length) throw new Error('Reward cooldown active');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO reward_events (rule_id, user_id, event_key, metadata) VALUES ($1, $2, $3, $4)`,
      [rule.id, userId, eventKey, JSON.stringify(metadata)]
    );
    const credit = await walletService.creditCoins(userId, rule.reward_coins, {
      type: 'creator_reward',
      reference_type: 'reward_rule',
      reference_id: rule.id,
      metadata: { slug: ruleSlug, event_key: eventKey },
    }, client);
    const claim = await client.query(
      `INSERT INTO reward_claims (rule_id, user_id, reward_coins, wallet_transaction_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [rule.id, userId, rule.reward_coins, credit.transaction.id]
    );
    await client.query('COMMIT');
    return claim.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function processHourlyRewards() {
  const rules = await getActiveRules();
  const hourly = rules.filter((r) => r.rule_type === 'hourly' || r.rule_type === 'quarter_hour');
  return { processed: hourly.length, note: 'Eligibility verified server-side on claim' };
}

module.exports = { getActiveRules, claimReward, processHourlyRewards, verifyEligibility };
