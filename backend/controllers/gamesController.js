const gameService = require('../services/gameService');

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
    const data = await gameService.listHistory(req.userId, req.params.slug, {
      limit: Number(req.query.limit || 20),
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
}

async function leaderboard(req, res) {
  try {
    const data = await gameService.getLeaderboard(req.params.slug, {
      limit: Number(req.query.limit || 10),
      lookbackDays: Number(req.query.days || 7),
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
}

module.exports = { listCatalog, play, history, leaderboard };
