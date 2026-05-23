const db = require('../config/database');
const walletService = require('./walletService');

async function getActiveRules() {
  const res = await db.query(`SELECT * FROM reward_rules WHERE active = true`);
  return res.rows;
}

async function claimReward(userId, ruleSlug, eventKey, metadata = {}) {
  const ruleRes = await db.query(`SELECT * FROM reward_rules WHERE slug = $1 AND active = true`, [ruleSlug]);
  const rule = ruleRes.rows[0];
  if (!rule) throw new Error('Reward rule not found');

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
  // TODO: join with live_room_members activity signals for real eligibility
  return { processed: hourly.length, note: 'Requires live activity telemetry — wire from live_room_events' };
}

module.exports = { getActiveRules, claimReward, processHourlyRewards };
