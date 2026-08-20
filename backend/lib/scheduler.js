const cron = require('node-cron');
const logger = require('../lib/logger');

let tasks = [];
const running = new Set();

function register(name, schedule, handler) {
  const task = cron.schedule(schedule, async () => {
    if (running.has(name)) {
      logger.warn('cron.skip.overlap', { name });
      return;
    }
    running.add(name);
    try {
      logger.info(`cron.start`, { name });
      await handler();
      logger.info(`cron.done`, { name });
    } catch (err) {
      logger.error(`cron.failed`, { name, error: err.message });
    } finally {
      running.delete(name);
    }
  });
  tasks.push({ name, task });
  return task;
}

function startScheduler() {
  if (process.env.DISABLE_CRON === 'true') {
    logger.warn('Cron disabled via DISABLE_CRON');
    return;
  }

  const leaderboardService = require('../services/leaderboardService');
  const agencyPerformanceService = require('../services/agencyPerformanceService');
  const contestService = require('../services/contestService');
  const rewardEngineService = require('../services/rewardEngineService');
  const liveRoomService = require('../services/liveRoomService');
  const pkBattleService = require('../services/pkBattleService');
  const db = require('../config/database');

  register('leaderboard-refresh', '2,7,12,17,22,27,32,37,42,47,52,57 * * * *', () => leaderboardService.refreshAll());
  register('agency-performance', '0 2 * * *', async () => {
    await agencyPerformanceService.refreshActiveCounts();
    await agencyPerformanceService.evaluateAgencyLevels();
  });
  register('contest-expire', '4,14,24,34,44,54 * * * *', () => contestService.expireEndedContests());
  register('reward-hourly', '8 * * * *', () => rewardEngineService.processHourlyRewards());
  register('live-idle-cleanup', '3,13,23,33,43,53 * * * *', () => liveRoomService.endIdleRooms(10));
  register('live-orphan-cleanup', '1,5,9,13,17,21,25,29,33,37,41,45,49,53,57 * * * *', () => liveRoomService.endOrphanRooms());
  register('live-presence-prune', '1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,47,49,51,53,55,57 * * * *', () => liveRoomService.pruneStaleMembers(60));
  register('pk-expire', '*/2 * * * *', async () => {
    const res = await db.query(
      `SELECT id FROM pk_battles WHERE status = 'active' AND ends_at <= CURRENT_TIMESTAMP`
    );
    for (const row of res.rows) {
      await pkBattleService.endBattle(row.id);
    }
  });

  const cosmeticService = require('../services/cosmeticService');
  register('cosmetics-expire', '6,21,36,51 * * * *', async () => {
    await cosmeticService.markExpiredOwnership();
    await cosmeticService.unequipExpired();
  });

  logger.info('Scheduler started', { jobs: tasks.map((t) => t.name) });
}

function stopScheduler() {
  tasks.forEach(({ task }) => task.stop());
  tasks = [];
}

module.exports = { startScheduler, stopScheduler, register };
