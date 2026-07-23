/**
 * Shared live-room game rounds (Greedy / Krazy Khazana).
 * One countdown + one landing outcome per room channel; spectators see bets/winners too.
 */
const db = require('../config/database');
const gameEngine = require('./gameEngine');
const coinSellerService = require('./coinSellerService');

const BETTING_MS = 25_000;
const RESULT_MS = 7_000;
const HISTORY_LIMIT = 24;

/** @type {import('socket.io').Server|null} */
let io = null;
/** channel → room state */
const rooms = new Map();

function attachIo(socketIo) {
  io = socketIo;
}

function sanitizeChannel(raw) {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
}

function prettyName(user) {
  const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return full || user.email || `ID ${user.display_id || ''}`.trim();
}

function emitRoom(channel, payload) {
  if (!io || !channel) return;
  io.to(`live:${channel}`).emit('live:game', { game: 'greedy', channel, ...payload });
}

function publicPlayer(p) {
  return {
    user_id: p.user_id,
    display_id: p.display_id,
    display_name: p.display_name,
    profile_pic: p.profile_pic || null,
    total_bet: p.total_bet,
    bets: p.bets,
    payout: p.payout || 0,
    win: !!p.win,
  };
}

function publicState(room) {
  if (!room) return null;
  const now = Date.now();
  return {
    channel: room.channel,
    game: 'greedy',
    round_id: room.round_id,
    phase: room.phase,
    phase_ends_at: room.phase_ends_at,
    ends_in_ms: Math.max(0, room.phase_ends_at - now),
    betting_ms: BETTING_MS,
    players: Object.values(room.players).map(publicPlayer),
    result: room.result || null,
    winners: room.winners || [],
    history: room.history || [],
    server_now: now,
  };
}

function ensureRoom(channel) {
  const ch = sanitizeChannel(channel);
  if (!ch) throw Object.assign(new Error('Room channel required'), { status: 400 });
  let room = rooms.get(ch);
  if (!room) {
    room = {
      channel: ch,
      round_id: null,
      phase: 'idle',
      phase_ends_at: 0,
      players: {},
      result: null,
      winners: [],
      history: [],
      settleTimer: null,
      nextTimer: null,
    };
    rooms.set(ch, room);
  }
  return room;
}

function clearTimers(room) {
  if (room.settleTimer) {
    clearTimeout(room.settleTimer);
    room.settleTimer = null;
  }
  if (room.nextTimer) {
    clearTimeout(room.nextTimer);
    room.nextTimer = null;
  }
}

function startBetting(room) {
  clearTimers(room);
  room.round_id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  room.phase = 'betting';
  room.phase_ends_at = Date.now() + BETTING_MS;
  room.players = {};
  room.result = null;
  room.winners = [];
  room.settleTimer = setTimeout(() => {
    settleRoom(room.channel).catch((e) => console.error('[gameRoom] settle', e.message || e));
  }, BETTING_MS);
  emitRoom(room.channel, { type: 'round_state', state: publicState(room) });
}

function ensureBettingRound(channel) {
  const room = ensureRoom(channel);
  if (room.phase === 'idle') {
    startBetting(room);
  } else if (room.phase === 'result' && Date.now() >= room.phase_ends_at) {
    startBetting(room);
  }
  return room;
}

async function getState(channel) {
  const room = ensureBettingRound(channel);
  if (room.phase === 'betting' && Date.now() >= room.phase_ends_at) {
    await settleRoom(channel);
  }
  return publicState(rooms.get(sanitizeChannel(channel)));
}

async function loadUser(userId) {
  const r = await db.query(
    `SELECT id, display_id, first_name, last_name, email, profile_pic FROM users WHERE id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

function gameWinCreditsEnabled() {
  const v = String(process.env.GAME_WIN_CREDITS_ENABLED || 'false').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Place / add bets during betting phase. Debits immediately.
 */
async function placeBet(userId, channel, { bets } = {}) {
  const room = ensureBettingRound(channel);
  if (room.phase !== 'betting') {
    throw Object.assign(new Error('Betting closed — wait for next round'), { status: 400 });
  }
  if (Date.now() >= room.phase_ends_at - 400) {
    throw Object.assign(new Error('Too late to bet this round'), { status: 400 });
  }

  const { bets: normalized, totalBet } = gameEngine.normalizeGreedyBets({ bets });

  const user = await loadUser(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const client = await db.pool.connect();
  let balance;
  let playSource;
  try {
    await client.query('BEGIN');
    const debit = await coinSellerService.debitGameSpend(
      userId,
      totalBet,
      {
        type: 'game_bet',
        reference_type: 'game_room_round',
        reference_id: null, /* wallet_transactions.reference_id is uuid; room ids are strings */
        metadata: {
          game_slug: 'greedy',
          channel: room.channel,
          room_round: true,
          room_round_id: room.round_id,
          bets: normalized,
        },
      },
      client
    );
    balance = Number(debit.play_balance != null ? debit.play_balance : debit.balance);
    playSource = debit.play_source || (debit.from_gift_inventory > 0 ? 'gift_inventory' : 'wallet');
    await client.query('COMMIT');
  } catch (err) {
    await db.safeRollback(client);
    if (err.code === 'INSUFFICIENT_BALANCE') {
      throw Object.assign(new Error(err.message || 'Insufficient coin balance'), {
        status: 400,
        code: 'INSUFFICIENT_BALANCE',
      });
    }
    throw err;
  } finally {
    client.release();
  }

  const existing = room.players[userId] || {
    user_id: userId,
    display_id: user.display_id,
    display_name: prettyName(user),
    profile_pic: user.profile_pic,
    bets: [],
    total_bet: 0,
    play_source: playSource,
  };

  const merged = new Map();
  for (const row of existing.bets || []) {
    merged.set(row.cellIdx, (merged.get(row.cellIdx) || 0) + Number(row.amount || 0));
  }
  for (const row of normalized) {
    merged.set(row.cellIdx, (merged.get(row.cellIdx) || 0) + Number(row.amount || 0));
  }
  existing.bets = [...merged.entries()].map(([cellIdx, amount]) => ({ cellIdx, amount }));
  existing.total_bet = existing.bets.reduce((s, r) => s + r.amount, 0);
  existing.play_source = playSource;
  room.players[userId] = existing;

  emitRoom(room.channel, {
    type: 'bet_placed',
    state: publicState(room),
    player: publicPlayer(existing),
  });

  return {
    ok: true,
    balance,
    play_source: playSource,
    state: publicState(room),
  };
}

async function settleRoom(channel) {
  const ch = sanitizeChannel(channel);
  const room = rooms.get(ch);
  if (!room) return null;
  if (room.phase !== 'betting') return publicState(room);

  clearTimers(room);
  room.phase = 'settling';

  const players = Object.values(room.players);
  const allBetCells = [];
  for (const p of players) {
    for (const b of p.bets || []) allBetCells.push(b.cellIdx);
  }

  const land = gameEngine.resolveGreedyLand(allBetCells);
  const landed = gameEngine.GREEDY_ITEMS[land.landIdx];
  const animation = {
    landCellIdx: land.landIdx,
    landRingIdx: land.landIdx,
    totalSteps: 42 + Math.floor(Math.random() * 18),
  };

  const winners = [];
  const creditsEnabled = gameWinCreditsEnabled();

  for (const p of players) {
    const winningBet = (p.bets || []).find((row) => row.cellIdx === land.landIdx);
    const payout = winningBet ? winningBet.amount * landed.mult : 0;
    p.payout = payout;
    p.win = payout > 0;

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const roundRes = await client.query(
        `INSERT INTO game_rounds (user_id, game_slug, bet_amount, payout_amount, outcome, pick, result)
         VALUES ($1, 'greedy', $2, $3, $4, $5::jsonb, $6::jsonb)
         RETURNING id`,
        [
          p.user_id,
          p.total_bet,
          payout,
          payout > 0 ? 'win' : 'loss',
          JSON.stringify({ bets: p.bets }),
          JSON.stringify({
            room_round: true,
            channel: room.channel,
            room_round_id: room.round_id,
            winning_fruit: { name: landed.name, emoji: landed.emoji, mult: landed.mult },
            winning_cell_idx: land.landIdx,
            animation,
            credits_applied: false,
            credits_pending: payout > 0 && !creditsEnabled,
            bets: p.bets,
            payout,
            win: payout > 0,
            outcome: payout > 0 ? 'win' : 'loss',
          }),
        ]
      );
      const roundId = roundRes.rows[0].id;
      if (payout > 0 && creditsEnabled) {
        const credit = await coinSellerService.creditGameWin(
          p.user_id,
          payout,
          p.play_source || 'wallet',
          {
            type: 'game_win',
            reference_type: 'game_round',
            reference_id: roundId,
            metadata: { game_slug: 'greedy', room_round: true, channel: room.channel },
          },
          client
        );
        await client.query(
          `UPDATE game_rounds
           SET credit_tx_id = $2,
               result = COALESCE(result, '{}'::jsonb) || $3::jsonb
           WHERE id = $1`,
          [
            roundId,
            credit.transaction?.id || null,
            JSON.stringify({ credits_applied: true, credits_pending: false }),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await db.safeRollback(client);
      console.error('[gameRoom] settle player', p.display_id, e.message || e);
    } finally {
      client.release();
    }

    if (payout > 0) {
      winners.push({
        user_id: p.user_id,
        display_id: p.display_id,
        display_name: p.display_name,
        profile_pic: p.profile_pic,
        payout,
        bet_amount: winningBet.amount,
      });
    }
  }

  winners.sort((a, b) => b.payout - a.payout);

  room.result = {
    winning_fruit: { name: landed.name, emoji: landed.emoji, mult: landed.mult },
    winning_cell_idx: land.landIdx,
    animation,
    player_count: players.length,
  };
  room.winners = winners;
  room.history = [
    {
      emoji: landed.emoji,
      name: landed.name,
      mult: landed.mult,
      at: Date.now(),
      winners: winners.length,
    },
    ...(room.history || []),
  ].slice(0, HISTORY_LIMIT);
  room.phase = 'result';
  room.phase_ends_at = Date.now() + RESULT_MS;

  emitRoom(room.channel, {
    type: 'round_result',
    state: publicState(room),
  });

  room.nextTimer = setTimeout(() => {
    startBetting(room);
  }, RESULT_MS);

  return publicState(room);
}

async function recentGlobalHistory(limit = 20) {
  const res = await db.query(
    `SELECT gr.created_at, gr.payout_amount, gr.result,
            u.display_id,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email, CONCAT('ID ', u.display_id::text)) AS display_name
     FROM game_rounds gr
     JOIN users u ON u.id = gr.user_id
     WHERE gr.game_slug = 'greedy' AND gr.payout_amount > 0
     ORDER BY gr.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((row) => {
    const result = row.result || {};
    return {
      created_at: row.created_at,
      payout_amount: Number(row.payout_amount || 0),
      display_id: row.display_id,
      display_name: row.display_name,
      winning_fruit: result.winning_fruit || null,
    };
  });
}

async function recentOutcomes(limit = 20) {
  const res = await db.query(
    `SELECT DISTINCT ON ((result->>'winning_cell_idx'), date_trunc('second', created_at))
            created_at,
            result->'winning_fruit' AS winning_fruit,
            result->>'winning_cell_idx' AS winning_cell_idx
     FROM game_rounds
     WHERE game_slug = 'greedy'
       AND result ? 'winning_fruit'
     ORDER BY date_trunc('second', created_at) DESC, created_at DESC
     LIMIT $1`,
    [limit]
  ).catch(async () => {
    return db.query(
      `SELECT created_at, result->'winning_fruit' AS winning_fruit
       FROM game_rounds
       WHERE game_slug = 'greedy' AND result ? 'winning_fruit'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
  });
  const seen = [];
  const out = [];
  for (const row of res.rows) {
    const wf = row.winning_fruit || {};
    const key = `${wf.emoji || ''}-${Math.floor(new Date(row.created_at).getTime() / 1000)}`;
    if (seen.includes(key)) continue;
    seen.push(key);
    out.push({ emoji: wf.emoji || '🎰', name: wf.name || '', mult: wf.mult || 0, at: row.created_at });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  attachIo,
  getState,
  placeBet,
  settleRoom,
  recentGlobalHistory,
  recentOutcomes,
  publicState,
  BETTING_MS,
};
