const {
  routes,
  hostRoutes,
  leaderboardRoutes,
  rewardRoutes,
} = require('./routes');
const { ensureReferralSchema } = require('./ensureSchema');
const { startRewardScheduler, stopRewardScheduler } = require('./services/rewardScheduler');

const referralEngine = require('./services/referralEngine');
const invitationService = require('./services/invitationService');
const rewardEngine = require('./services/rewardEngine');
const missionEngine = require('./services/missionEngine');
const broadcastTracker = require('./services/broadcastTracker');
const fraudService = require('./services/fraudService');
const settingsService = require('./services/settingsService');
const analyticsService = require('./services/analyticsService');
const leaderboardService = require('./services/leaderboardService');
const faceVerificationGate = require('./services/faceVerificationGate');

async function boot() {
  await ensureReferralSchema();
  startRewardScheduler(60 * 1000);
}

function shutdown() {
  stopRewardScheduler();
}

module.exports = {
  routes,
  hostRoutes,
  leaderboardRoutes,
  rewardRoutes,
  boot,
  shutdown,
  ensureReferralSchema,
  services: {
    referralEngine,
    invitationService,
    rewardEngine,
    missionEngine,
    broadcastTracker,
    fraudService,
    settingsService,
    analyticsService,
    leaderboardService,
    faceVerificationGate,
  },
};
