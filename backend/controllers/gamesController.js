const gameService = require('../services/gameService');
const gameRoomService = require('../services/gameRoomService');
const { clampLimit } = require('../lib/pagination');

async function listCatalog(_req, res) {
  const data = await gameService.listCatalog({ activeOnly: true });
  res.json({ success: true, data });
}

async function play(req, res) {
  try {
    const data = await gameService.playRound(req.userId, req.params.slug, {
      bet_amount: req.body.bet_amount,
      pick: req.body.pick,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message, code: e.code || undefined });
  }
}

async function history(req, res) {
  try {
    const scope = String(req.query.scope || 'mine').toLowerCase();
    if (scope === 'wins' || scope === 'public') {
      const data = await gameRoomService.recentGlobalHistory(clampLimit(req.query.limit, { max: 50, fallback: 20 }));
      return res.json({ success: true, data });
    }
    if (scope === 'outcomes') {
      const data = await gameRoomService.recentOutcomes(clampLimit(req.query.limit, { max: 50, fallback: 24 }));
      return res.json({ success: true, data });
    }
    const data = await gameService.listHistory(req.userId, req.params.slug, {
      limit: clampLimit(req.query.limit, { max: 50, fallback: 20 }),
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
}

async function leaderboard(req, res) {
  try {
    const data = await gameService.getLeaderboard(req.params.slug, {
      limit: clampLimit(req.query.limit, { max: 50, fallback: 10 }),
      lookbackDays: Number(req.query.days || 7),
      mode: String(req.query.mode || 'players').toLowerCase() === 'rounds' ? 'rounds' : 'players',
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
}

async function roomState(req, res) {
  try {
    if (req.params.slug !== 'greedy') {
      return res.status(400).json({ success: false, message: 'Room mode only for greedy' });
    }
    const channel = req.query.channel || req.body?.channel;
    const data = await gameRoomService.getState(channel);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
}

async function roomBet(req, res) {
  try {
    if (req.params.slug !== 'greedy') {
      return res.status(400).json({ success: false, message: 'Room mode only for greedy' });
    }
    const data = await gameRoomService.placeBet(req.userId, req.body.channel, {
      bets: req.body.bets || req.body.pick?.bets,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message, code: e.code || undefined });
  }
}

module.exports = { listCatalog, play, history, leaderboard, roomState, roomBet };
