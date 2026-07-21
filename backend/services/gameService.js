const db = require('../config/database');
const walletService = require('./walletService');
const gameEngine = require('./gameEngine');
const coinSellerService = require('./coinSellerService');

function mapCatalogRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    html_path: row.html_path,
    category: row.category,
    min_bet: Number(row.min_bet),
    max_bet: row.max_bet != null ? Number(row.max_bet) : null,
    house_edge_pct: row.house_edge_pct != null ? Number(row.house_edge_pct) : null,
    sort_order: Number(row.sort_order),
    metadata: row.metadata || {},
  };
}

function roundCodeFromId(id) {
  const digits = String(id || '').replace(/[^a-f0-9]/gi, '').slice(-8);
  const num = parseInt(digits || '0', 16) % 1000000;
  return String(num).padStart(6, '0');
}

function prettyName(user) {
  const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return full || user.email || `ID ${user.display_id || ''}`.trim();
}

function mapRoundRow(row) {
  const result = row.result || {};
  const bets = result.bets || row.pick?.bets || [];
  return {
    round_id: row.id,
    round_code: roundCodeFromId(row.id),
    game_slug: row.game_slug,
    bet_amount: Number(row.bet_amount || 0),
    payout_amount: Number(row.payout_amount || 0),
    outcome: row.outcome,
    created_at: row.created_at,
    selected_bets: bets,
    winning_fruit: result.winning_fruit || null,
    winner_side: result.winner_side || null,
    winning_category: result.winning_category || null,
    display_name: row.display_name,
    display_id: row.display_id,
  };
}

async function listCatalog({ activeOnly = true } = {}) {
  let sql = `SELECT id, slug, name, emoji, html_path, category, min_bet, max_bet,
                    house_edge_pct, sort_order, metadata
             FROM game_catalog`;
  if (activeOnly) sql += ` WHERE is_active = TRUE`;
  sql += ` ORDER BY sort_order ASC, name ASC`;
  const res = await db.query(sql);
  return res.rows.map(mapCatalogRow);
}

async function getBySlug(slug, { activeOnly = false } = {}) {
  const res = await db.query(
    `SELECT id, slug, name, emoji, html_path, category, min_bet, max_bet,
            house_edge_pct, sort_order, metadata, is_active
     FROM game_catalog WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  const row = res.rows[0];
  if (!row) return null;
  if (activeOnly && !row.is_active) return null;
  return mapCatalogRow(row);
}

function validateTotalBet(game, totalBet) {
  const bet = Number(totalBet);
  if (!Number.isFinite(bet) || bet <= 0 || !Number.isInteger(bet)) {
    throw Object.assign(new Error('Invalid bet amount'), { status: 400 });
  }
  if (bet < game.min_bet) {
    throw Object.assign(new Error(`Minimum total bet is ${game.min_bet.toLocaleString()} coins`), { status: 400 });
  }
  if (game.max_bet != null && bet > game.max_bet) {
    throw Object.assign(new Error(`Maximum total bet is ${game.max_bet.toLocaleString()} coins`), { status: 400 });
  }
  return bet;
}

async function playRound(userId, slug, { bet_amount: betAmount, pick = {} } = {}) {
  const game = await getBySlug(slug, { activeOnly: true });
  if (!game) throw Object.assign(new Error('Game not found'), { status: 404 });

  const resolved = gameEngine.resolveRound(slug, pick, Number(betAmount || 0));
  const totalBet = validateTotalBet(game, resolved.totalBet || betAmount);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const roundRes = await client.query(
      `INSERT INTO game_rounds (user_id, game_slug, bet_amount, payout_amount, outcome, pick, result)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       RETURNING id, created_at`,
      [userId, slug, totalBet, resolved.payout, resolved.outcome, JSON.stringify(pick || {}), JSON.stringify(resolved)]
    );
    const round = roundRes.rows[0];

    const debit = await coinSellerService.debitGameSpend(
      userId,
      totalBet,
      { type: 'game_bet', reference_type: 'game_round', reference_id: round.id, metadata: { game_slug: slug, pick } },
      client
    );

    let balance = Number(debit.play_balance != null ? debit.play_balance : debit.balance);
    let creditTxId = null;
    const playSource = debit.play_source || (debit.from_gift_inventory > 0 ? 'gift_inventory' : 'wallet');
    if (resolved.payout > 0) {
      const credit = await coinSellerService.creditGameWin(
        userId,
        resolved.payout,
        playSource,
        {
          type: 'game_win',
          reference_type: 'game_round',
          reference_id: round.id,
          metadata: { game_slug: slug, outcome: resolved.outcome, winning_fruit: resolved.winning_fruit || null },
        },
        client
      );
      creditTxId = credit.transaction?.id || null;
      balance = Number(credit.play_balance != null ? credit.play_balance : credit.balance);
    }

    await client.query(`UPDATE game_rounds SET debit_tx_id = $2, credit_tx_id = $3 WHERE id = $1`, [
      round.id,
      debit.transaction?.id || null,
      creditTxId,
    ]);
    await client.query('COMMIT');

    return {
      round_id: round.id,
      round_code: roundCodeFromId(round.id),
      game_slug: slug,
      bet_amount: totalBet,
      payout: Number(resolved.payout || 0),
      mult: Number(resolved.mult || 0),
      win: !!resolved.win,
      outcome: resolved.outcome,
      balance,
      play_source: playSource,
      animation: resolved.animation,
      winning_fruit: resolved.winning_fruit || null,
      winIdx: resolved.prizeIdx != null ? resolved.prizeIdx : undefined,
      prizeGem: resolved.prizeGem || undefined,
      selected_bets: resolved.bets || pick?.bets || [],
      created_at: round.created_at,
    };
  } catch (err) {
    await db.safeRollback(client);
    if (err.code === 'INSUFFICIENT_BALANCE') {
      const msg = err.message && /gift coin/i.test(err.message)
        ? err.message
        : 'Insufficient coin balance';
      throw Object.assign(new Error(msg), { status: 400, code: 'INSUFFICIENT_BALANCE' });
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listHistory(userId, slug, { limit = 20 } = {}) {
  const res = await db.query(
    `SELECT gr.*, u.display_id, u.first_name, u.last_name, u.email,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email, CONCAT('ID ', u.display_id::text)) AS display_name
     FROM game_rounds gr
     JOIN users u ON u.id = gr.user_id
     WHERE gr.user_id = $1 AND gr.game_slug = $2
     ORDER BY gr.created_at DESC
     LIMIT $3`,
    [userId, slug, limit]
  );
  return res.rows.map(mapRoundRow);
}

async function getLeaderboard(slug, { limit = 10, lookbackDays = 7 } = {}) {
  const res = await db.query(
    `SELECT gr.*, u.display_id, u.first_name, u.last_name, u.email,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email, CONCAT('ID ', u.display_id::text)) AS display_name
     FROM game_rounds gr
     JOIN users u ON u.id = gr.user_id
     WHERE gr.game_slug = $1
       AND gr.payout_amount > 0
       AND gr.created_at >= NOW() - ($2::int * INTERVAL '1 day')
     ORDER BY gr.payout_amount DESC, gr.created_at DESC
     LIMIT $3`,
    [slug, lookbackDays, limit]
  );
  return res.rows.map(mapRoundRow);
}

module.exports = { listCatalog, getBySlug, playRound, listHistory, getLeaderboard };
