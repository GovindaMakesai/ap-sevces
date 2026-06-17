const cron = require('node-cron');
const logger = require('../lib/logger');

let tasks = [];

function register(name, schedule, handler) {
  const task = cron.schedule(schedule, async () => {
    try {
      logger.info(`cron.start`, { name });
      await handler();
      logger.info(`cron.done`, { name });
    } catch (err) {
      logger.error(`cron.failed`, { name, error: err.message });
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

  register('leaderboard-refresh', '*/5 * * * *', () => leaderboardService.refreshAll());
  register('agency-performance', '0 2 * * *', async () => {
    await agencyPerformanceService.refreshActiveCounts();
    await agencyPerformanceService.evaluateAgencyLevels();
  });
  register('contest-expire', '*/10 * * * *', () => contestService.expireEndedContests());
  register('reward-hourly', '0 * * * *', () => rewardEngineService.processHourlyRewards());
  register('live-idle-cleanup', '*/5 * * * *', () => liveRoomService.endIdleRooms(5));
  register('live-orphan-cleanup', '*/1 * * * *', () => liveRoomService.endOrphanRooms());
  register('live-presence-prune', '*/1 * * * *', () => liveRoomService.pruneStaleMembers(45));
  register('pk-expire', '* * * * *', async () => {
    const res = await db.query(
      `SELECT id FROM pk_battles WHERE status = 'active' AND ends_at <= CURRENT_TIMESTAMP`
    );
    for (const row of res.rows) {
      await pkBattleService.endBattle(row.id);
    }
  });

  logger.info('Scheduler started', { jobs: tasks.map((t) => t.name) });
}

function stopScheduler() {
  tasks.forEach(({ task }) => task.stop());
  tasks = [];
}

module.exports = { startScheduler, stopScheduler, register };
