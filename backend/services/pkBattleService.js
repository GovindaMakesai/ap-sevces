const db = require('../config/database');
const walletService = require('./walletService');
const { uidFromUserId } = require('../lib/agoraUid');

const FORMAT_TEAM_SIZE = { '1v1': 1, '1v2': 2, '3v3': 3, '1v4': 4, '1v8': 8 };
const MAX_PK_FIGHTERS = 6;

/** In-memory map so gifts on either host stream score the shared PK battle. */
const channelBattleLinks = new Map();
/** Dual-host meta kept while battle is active (channels, names, mode). */
const battleExtras = new Map();

function linkChannelToBattle(channel, battleId) {
  const ch = String(channel || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!ch || !battleId) return;
  channelBattleLinks.set(ch, battleId);
}

function clearBattleChannelLinks(battleId) {
  if (!battleId) return;
  for (const [ch, id] of [...channelBattleLinks.entries()]) {
    if (String(id) === String(battleId)) channelBattleLinks.delete(ch);
  }
  battleExtras.delete(String(battleId));
}

function listChannelsForBattle(battleId) {
  const out = [];
  if (!battleId) return out;
  for (const [ch, id] of channelBattleLinks.entries()) {
    if (String(id) === String(battleId)) out.push(ch);
  }
  return out;
}

function setBattleExtras(battleId, extras = {}) {
  if (!battleId) return;
  const prev = battleExtras.get(String(battleId)) || {};
  battleExtras.set(String(battleId), { ...prev, ...extras });
}

function getBattleExtras(battleId) {
  if (!battleId) return {};
  return battleExtras.get(String(battleId)) || {};
}

async function setChannelsPkStatus(channels, status) {
  const list = [...new Set((channels || []).filter(Boolean))];
  for (const ch of list) {
    try {
      await db.query(
        `UPDATE live_rooms SET pk_status = $2, updated_at = CURRENT_TIMESTAMP WHERE channel = $1`,
        [String(ch), status]
      );
    } catch (_e) {
      /* ignore missing rooms */
    }
  }
}

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
    extraOpponents = [],
  } = {}
) {
  if (!hostUserId) throw new Error('Host required for PK');
  await joinBattle(battleId, hostUserId, 1, hostName);

  const others = [];
  const seen = new Set([String(hostUserId)]);
  const pushOther = (raw, fallbackName) => {
    const uid = String(raw?.userId || raw?.id || raw || '').trim();
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    others.push({
      userId: uid,
      name: raw?.name || raw?.displayName || fallbackName || 'Player',
    });
  };
  pushOther({ userId: opponentUserId, name: opponentName }, 'Rival');
  (Array.isArray(extraOpponents) ? extraOpponents : []).forEach((o) => pushOther(o, 'Rival'));
  (Array.isArray(teammateUserIds) ? teammateUserIds : []).forEach((m) => pushOther(m, 'Teammate'));

  /* Fill team 2 first (up to 3), then team 1 mates — 3v3 / 6 people max */
  const team2 = others.slice(0, 3);
  const team1Mates = others.slice(3, MAX_PK_FIGHTERS - 1);
  for (const p of team2) {
    try {
      await joinBattle(battleId, p.userId, 2, p.name);
    } catch (_e) { /* team full */ }
  }
  for (const p of team1Mates) {
    try {
      await joinBattle(battleId, p.userId, 1, p.name);
    } catch (_e) { /* team full */ }
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

async function endBattle(battleId, opts = {}) {
  const forfeitingUserId = opts.forfeitingUserId || opts.leavingUserId || null;
  const reason = String(opts.reason || (forfeitingUserId ? 'forfeit' : 'score'));

  const battle = await getBattle(battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status === 'ended') {
    const snap = await getBattleSnapshot(battleId);
    if (snap) {
      snap.winnerTeam = battle.winner_team != null ? Number(battle.winner_team) : null;
      snap.endReason = reason;
    }
    clearBattleChannelLinks(battleId);
    return snap;
  }

  /* Keep dual-host meta for the end payload (clients need channel/team orientation) */
  const extrasBefore = getBattleExtras(battleId);
  const linkedBefore = listChannelsForBattle(battleId);

  const teams = await getTeamScores(battleId);
  let winnerTeam = null;
  let isDraw = false;
  let forfeit = false;

  if (forfeitingUserId) {
    /* Quitting / leaving / early stop = loss for that host (even if scores equal) */
    forfeit = true;
    const parts = await db.query(
      `SELECT user_id, team FROM pk_participants WHERE battle_id = $1`,
      [battleId]
    );
    const mePart = parts.rows.find((p) => String(p.user_id) === String(forfeitingUserId));
    let loserTeam = mePart ? Number(mePart.team) : null;
    if (loserTeam == null) {
      if (String(extrasBefore.challengerUserId) === String(forfeitingUserId)) loserTeam = 1;
      else if (String(extrasBefore.rivalUserId) === String(forfeitingUserId)) loserTeam = 2;
    }
    if (loserTeam === 1) winnerTeam = 2;
    else if (loserTeam === 2) winnerTeam = 1;
    else if (teams.length >= 2) {
      /* unknown team — fall through to scores */
      forfeit = false;
    }
  }

  if (!forfeit) {
    if (teams.length >= 2) {
      const s0 = Number(teams[0].team_score);
      const s1 = Number(teams[1].team_score);
      if (s0 === s1) {
        winnerTeam = null;
        isDraw = true;
      } else {
        winnerTeam = s0 > s1 ? teams[0].team : teams[1].team;
      }
    } else if (teams.length === 1) {
      winnerTeam = teams[0].team;
    }
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

  if (winnerTeam != null) {
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
  }

  /* Build snapshot BEFORE clearing extras/links so dual-host UI stays oriented */
  const snapshot = await getBattleSnapshot(battleId);
  if (snapshot) {
    snapshot.winnerTeam = winnerTeam != null ? Number(winnerTeam) : null;
    snapshot.isDraw = Boolean(isDraw && !forfeit);
    snapshot.forfeit = forfeit;
    snapshot.endReason = forfeit ? 'forfeit' : isDraw ? 'draw' : reason || 'score';
    snapshot.forfeitingUserId = forfeitingUserId || null;
    snapshot.linkedChannels = linkedBefore.length
      ? linkedBefore
      : [extrasBefore.challengerChannel || battle.channel, extrasBefore.rivalChannel].filter(Boolean);
    if (extrasBefore.challengerChannel) snapshot.challengerChannel = extrasBefore.challengerChannel;
    if (extrasBefore.rivalChannel) snapshot.rivalChannel = extrasBefore.rivalChannel;
    if (extrasBefore.challengerUserId) snapshot.challengerUserId = extrasBefore.challengerUserId;
    if (extrasBefore.rivalUserId) snapshot.rivalUserId = extrasBefore.rivalUserId;
    if (extrasBefore.hostName) snapshot.hostName = extrasBefore.hostName;
    if (extrasBefore.rivalName) {
      snapshot.rivalName = extrasBefore.rivalName;
      snapshot.opponentName = extrasBefore.rivalName;
    }
    const t1Name = snapshot.hostName || 'Host';
    const t2Name = snapshot.rivalName || 'Rival';
    if (snapshot.isDraw) {
      snapshot.winnerName = 'Draw';
    } else if (Number(winnerTeam) === 1) {
      snapshot.winnerName = t1Name;
    } else if (Number(winnerTeam) === 2) {
      snapshot.winnerName = t2Name;
    } else {
      snapshot.winnerName = null;
    }
  }

  clearBattleChannelLinks(battleId);
  return snapshot;
}

async function getBattle(battleId) {
  const res = await db.query(`SELECT * FROM pk_battles WHERE id = $1`, [battleId]);
  return res.rows[0] || null;
}

async function getActiveBattleByChannel(channel) {
  const ch = String(channel || '');
  if (!ch) return null;
  const res = await db.query(
    `SELECT * FROM pk_battles WHERE channel = $1 AND status IN ('pending','active') ORDER BY created_at DESC LIMIT 1`,
    [ch]
  );
  if (res.rows[0]) return res.rows[0];
  /* Linked dual-host PK: gifts on either stream feed the same battle */
  const linkedId = channelBattleLinks.get(ch);
  if (!linkedId) return null;
  const battle = await getBattle(linkedId);
  if (battle && (battle.status === 'active' || battle.status === 'pending')) return battle;
  channelBattleLinks.delete(ch);
  return null;
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
  const extras = getBattleExtras(battleId);
  const linked = listChannelsForBattle(battleId);
  const snapshot = {
    battle,
    participants: participants.rows,
    teams,
    hostName: extras.hostName || left[0]?.display_name || null,
    rivalName: extras.rivalName || right[0]?.display_name || null,
    opponentName: extras.rivalName || extras.opponentName || right[0]?.display_name || null,
    mode: extras.mode || null,
    challengerUserId: extras.challengerUserId || left[0]?.user_id || null,
    rivalUserId: extras.rivalUserId || right[0]?.user_id || null,
    challengerChannel: extras.challengerChannel || battle.channel || null,
    rivalChannel: extras.rivalChannel || null,
    linkedChannels: linked.length
      ? linked
      : [extras.challengerChannel || battle.channel, extras.rivalChannel].filter(Boolean),
    mutual: Boolean(extras.mutual || (linked && linked.length > 1)),
    challengerAgoraUid: null,
    rivalAgoraUid: null,
    fighters: Array.isArray(extras.fighters) ? extras.fighters : [],
  };
  const cUid = snapshot.challengerUserId;
  const rUid = snapshot.rivalUserId;
  if (cUid) snapshot.challengerAgoraUid = uidFromUserId(cUid);
  if (rUid) snapshot.rivalAgoraUid = uidFromUserId(rUid);
  return snapshot;
}

/** Full battle UI payload for a channel (primary or linked dual host). */
async function getActiveBattleSnapshotForChannel(channel) {
  const battle = await getActiveBattleByChannel(channel);
  if (!battle || battle.status !== 'active') return null;
  return getBattleSnapshot(battle.id);
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
  getActiveBattleSnapshotForChannel,
  linkChannelToBattle,
  clearBattleChannelLinks,
  listChannelsForBattle,
  setBattleExtras,
  getBattleExtras,
  setChannelsPkStatus,
};
