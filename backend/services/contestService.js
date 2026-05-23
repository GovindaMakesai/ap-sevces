const db = require('../config/database');
const walletService = require('./walletService');

async function createContest(data) {
  const res = await db.query(
    `INSERT INTO contests (slug, title, contest_type, status, starts_at, ends_at, vip_only, auto_enroll, prize_pool, rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      data.slug,
      data.title,
      data.contest_type,
      data.status || 'draft',
      data.starts_at,
      data.ends_at,
      data.vip_only || false,
      data.auto_enroll || false,
      data.prize_pool || 0,
      JSON.stringify(data.rules || {}),
    ]
  );
  return res.rows[0];
}

async function enrollUser(contestId, userId) {
  const res = await db.query(
    `INSERT INTO contest_entries (contest_id, user_id) VALUES ($1, $2)
     ON CONFLICT (contest_id, user_id) DO NOTHING RETURNING *`,
    [contestId, userId]
  );
  return res.rows[0];
}

async function addScore(contestId, userId, delta) {
  await db.query(
    `UPDATE contest_entries SET score = score + $3 WHERE contest_id = $1 AND user_id = $2`,
    [contestId, userId, delta]
  );
}

async function getActiveContests({ vipOnly = null } = {}) {
  const res = await db.query(
    `SELECT * FROM contests
     WHERE status = 'active' AND starts_at <= CURRENT_TIMESTAMP AND ends_at > CURRENT_TIMESTAMP
       AND ($1::boolean IS NULL OR vip_only = $1)
     ORDER BY ends_at ASC`,
    [vipOnly]
  );
  return res.rows;
}

async function finalizeContest(contestId) {
  const contest = (await db.query(`SELECT * FROM contests WHERE id = $1`, [contestId])).rows[0];
  if (!contest || contest.status === 'ended') return null;

  await db.query(
    `WITH ranked AS (
       SELECT id, user_id, score, ROW_NUMBER() OVER (ORDER BY score DESC) AS r
       FROM contest_entries WHERE contest_id = $1
     )
     UPDATE contest_entries ce SET rank = ranked.r FROM ranked WHERE ce.id = ranked.id`,
    [contestId]
  );

  const top = await db.query(
    `SELECT * FROM contest_entries WHERE contest_id = $1 ORDER BY rank ASC NULLS LAST LIMIT 10`,
    [contestId]
  );

  const pool = Number(contest.prize_pool || 0);
  const weights = [0.4, 0.25, 0.15, 0.1, 0.05, 0.025, 0.015, 0.01, 0.005, 0.005];
  for (let i = 0; i < top.rows.length && i < weights.length; i++) {
    const reward = Math.floor(pool * weights[i]);
    if (reward <= 0) continue;
    const credit = await walletService.creditCoins(top.rows[i].user_id, reward, {
      type: 'contest_reward',
      reference_type: 'contest',
      reference_id: contestId,
    });
    await db.query(
      `INSERT INTO contest_rewards (contest_id, user_id, rank, reward_coins, wallet_transaction_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [contestId, top.rows[i].user_id, i + 1, reward, credit.transaction.id]
    );
  }

  await db.query(`UPDATE contests SET status = 'ended' WHERE id = $1`, [contestId]);
  return { contest, winners: top.rows };
}

async function expireEndedContests() {
  const res = await db.query(
    `SELECT id FROM contests WHERE status = 'active' AND ends_at <= CURRENT_TIMESTAMP`
  );
  const results = [];
  for (const row of res.rows) {
    results.push(await finalizeContest(row.id));
  }
  return results;
}

module.exports = {
  createContest,
  enrollUser,
  addScore,
  getActiveContests,
  finalizeContest,
  expireEndedContests,
};
