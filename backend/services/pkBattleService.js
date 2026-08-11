const db = require('../config/database');
const walletService = require('./walletService');

const FORMAT_TEAM_SIZE = { '1v1': 1, '1v2': 2, '1v4': 4, '1v8': 8 };

async function createBattle({ channel, liveRoomId, format = '1v1', durationSeconds = 300 }) {
  if (!FORMAT_TEAM_SIZE[format]) throw new Error('Invalid PK format');
  const res = await db.query(
    `INSERT INTO pk_battles (channel, live_room_id, format, duration_seconds, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
    [channel, liveRoomId || null, format, durationSeconds]
  );
  if (liveRoomId) {
    await db.query(`UPDATE live_rooms SET pk_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
      liveRoomId,
    ]);
  }
  return res.rows[0];
}

async function joinBattle(battleId, userId, team, displayName) {
  const battle = await getBattle(battleId);
  if (!battle || battle.status === 'ended') throw new Error('Battle not available');

  const maxPerTeam = FORMAT_TEAM_SIZE[battle.format] || 1;
  const count = await db.query(
    `SELECT COUNT(*)::int AS c FROM pk_participants WHERE battle_id = $1 AND team = $2`,
    [battleId, team]
  );
  if (count.rows[0].c >= maxPerTeam) {
    const existing = await db.query(
      `SELECT team FROM pk_participants WHERE battle_id = $1 AND user_id = $2`,
      [battleId, userId]
    );
    if (!existing.rows[0]) throw new Error('Team full');
  }

  await db.query(
    `INSERT INTO pk_participants (battle_id, user_id, team, display_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (battle_id, user_id) DO UPDATE SET team = EXCLUDED.team, display_name = EXCLUDED.display_name`,
    [battleId, userId, team, displayName || 'User']
  );
  await db.query(
    `INSERT INTO pk_scores (battle_id, user_id, score, gift_coins) VALUES ($1, $2, 0, 0)
     ON CONFLICT (battle_id, user_id) DO NOTHING`,
    [battleId, userId]
  );
  return getBattleSnapshot(battleId);
}

/**
 * Seed sides so score bar + gifts work after start.
 * Host → team 1. Optional friend/team rivals → team 2.
 */
async function seedBattleSides(
  battleId,
  {
    hostUserId,
    hostName = 'Host',
    opponentUserId = null,
    opponentName = 'Rival',
    teammateUserIds = [],
  } = {}
) {
  if (!hostUserId) throw new Error('Host required for PK');
  await joinBattle(battleId, hostUserId, 1, hostName);

  const mates = Array.isArray(teammateUserIds) ? teammateUserIds : [];
  for (const mate of mates) {
    const uid = mate?.userId || mate?.id || mate;
    if (!uid || String(uid) === String(hostUserId)) continue;
    const name = mate?.name || mate?.displayName || 'Teammate';
    try {
      await joinBattle(battleId, uid, 1, name);
    } catch (_e) {
      /* team full */
    }
  }

  if (opponentUserId && String(opponentUserId) !== String(hostUserId)) {
    await joinBattle(battleId, opponentUserId, 2, opponentName || 'Rival');
  }

  return getBattleSnapshot(battleId);
}

async function startBattle(battleId) {
  const battle = await getBattle(battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status === 'active') return battle;
  const endsAt = new Date(Date.now() + battle.duration_seconds * 1000);
  const res = await db.query(
    `UPDATE pk_battles SET status = 'active', started_at = CURRENT_TIMESTAMP, ends_at = $2
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [battleId, endsAt]
  );
  if (battle.live_room_id) {
    await db.query(`UPDATE live_rooms SET pk_status = 'active' WHERE id = $1`, [battle.live_room_id]);
  }
  return res.rows[0] || battle;
}

async function addGiftScore(battleId, userId, coinAmount) {
  const battle = await getBattle(battleId);
  if (!battle || battle.status !== 'active') return null;
  const amount = Math.max(0, Number(coinAmount) || 0);
  if (!amount || !userId) return null;

  await db.query(
    `INSERT INTO pk_participants (battle_id, user_id, team, display_name)
     VALUES ($1, $2, 1, 'Player')
     ON CONFLICT (battle_id, user_id) DO NOTHING`,
    [battleId, userId]
  );
  await db.query(
    `INSERT INTO pk_scores (battle_id, user_id, score, gift_coins) VALUES ($1, $2, 0, 0)
     ON CONFLICT (battle_id, user_id) DO NOTHING`,
    [battleId, userId]
  );

  const res = await db.query(
    `UPDATE pk_scores SET score = score + $3, gift_coins = gift_coins + $3, updated_at = CURRENT_TIMESTAMP
     WHERE battle_id = $1 AND user_id = $2 RETURNING *`,
    [battleId, userId, amount]
  );
  return res.rows[0];
}

async function getTeamScores(battleId) {
  const res = await db.query(
    `SELECT p.team, COALESCE(SUM(s.score), 0)::bigint AS team_score
     FROM pk_participants p
     LEFT JOIN pk_scores s ON s.battle_id = p.battle_id AND s.user_id = p.user_id
     WHERE p.battle_id = $1 GROUP BY p.team ORDER BY p.team`,
    [battleId]
  );
  const byTeam = new Map(res.rows.map((r) => [Number(r.team), Number(r.team_score) || 0]));
  return [
    { team: 1, team_score: byTeam.get(1) || 0 },
    { team: 2, team_score: byTeam.get(2) || 0 },
  ];
}

async function endBattle(battleId) {
  const battle = await getBattle(battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status === 'ended') return getBattleSnapshot(battleId);

  const teams = await getTeamScores(battleId);
  let winnerTeam = null;
  if (teams.length >= 2) {
    winnerTeam =
      Number(teams[0].team_score) >= Number(teams[1].team_score) ? teams[0].team : teams[1].team;
  } else if (teams.length === 1) {
    winnerTeam = teams[0].team;
  }

  await db.query(
    `UPDATE pk_battles SET status = 'ended', ended_at = CURRENT_TIMESTAMP, winner_team = $2 WHERE id = $1`,
    [battleId, winnerTeam]
  );

  if (battle.live_room_id) {
    await db.query(`UPDATE live_rooms SET pk_status = 'ended' WHERE id = $1`, [battle.live_room_id]);
  }

  const settingsRes = await db.query(`SELECT value FROM platform_settings WHERE key = 'pk' LIMIT 1`);
  const rewardPct = settingsRes.rows[0]?.value?.winner_reward_pct || 5;

  const winners = await db.query(
    `SELECT p.user_id, s.score FROM pk_participants p
     JOIN pk_scores s ON s.battle_id = p.battle_id AND s.user_id = p.user_id
     WHERE p.battle_id = $1 AND p.team = $2`,
    [battleId, winnerTeam]
  );

  const totalPool = winners.rows.reduce((sum, w) => sum + Number(w.score || 0), 0);
  for (const w of winners.rows) {
    if (totalPool <= 0) continue;
    const reward = Math.floor((Number(w.score) / totalPool) * totalPool * (rewardPct / 100));
    if (reward <= 0) continue;
    const credit = await walletService.creditStars(w.user_id, reward, {
      type: 'pk_reward',
      reference_type: 'pk_battle',
      reference_id: battleId,
    });
    await db.query(
      `INSERT INTO pk_rewards (battle_id, user_id, reward_coins, wallet_transaction_id) VALUES ($1, $2, $3, $4)`,
      [battleId, w.user_id, reward, credit.transaction.id]
    );
  }

  return getBattleSnapshot(battleId);
}

async function getBattle(battleId) {
  const res = await db.query(`SELECT * FROM pk_battles WHERE id = $1`, [battleId]);
  return res.rows[0] || null;
}

async function getActiveBattleByChannel(channel) {
  const res = await db.query(
    `SELECT * FROM pk_battles WHERE channel = $1 AND status IN ('pending','active') ORDER BY created_at DESC LIMIT 1`,
    [channel]
  );
  return res.rows[0] || null;
}

async function getBattleSnapshot(battleId) {
  const battle = await getBattle(battleId);
  if (!battle) return null;
  const participants = await db.query(
    `SELECT p.*, s.score, s.gift_coins FROM pk_participants p
     LEFT JOIN pk_scores s ON s.battle_id = p.battle_id AND s.user_id = p.user_id
     WHERE p.battle_id = $1`,
    [battleId]
  );
  const teams = await getTeamScores(battleId);
  const left = participants.rows.filter((p) => Number(p.team) === 1);
  const right = participants.rows.filter((p) => Number(p.team) === 2);
  return {
    battle,
    participants: participants.rows,
    teams,
    hostName: left[0]?.display_name || null,
    rivalName: right[0]?.display_name || null,
    opponentName: right[0]?.display_name || null,
  };
}

module.exports = {
  createBattle,
  joinBattle,
  seedBattleSides,
  startBattle,
  addGiftScore,
  endBattle,
  getBattle,
  getActiveBattleByChannel,
  getBattleSnapshot,
};
