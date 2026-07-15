const rewardEngine = require('./rewardEngine');
const referralEngine = require('./referralEngine');

let timer = null;

/**
 * Periodic reward + revalidation worker. Isolated from global scheduler;
 * started from module index so live/wallet schedulers stay untouched.
 */
function startRewardScheduler(intervalMs = 60000) {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      await rewardEngine.processDueScheduled(40);
    } catch (e) {
      console.warn('[referral] reward scheduler', e.message);
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('✅ Referral reward scheduler started');
}

function stopRewardScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function notifyStub(userId, type, payload) {
  /* Push notifications: write event row; wire to existing Notification model optionally later */
  try {
    await referralEngine.logEvent({
      inviteeId: userId,
      inviterId: null,
      referralId: null,
      eventType: `notify:${type}`,
      payload,
    });
  } catch (_e) {}
}

module.exports = {
  startRewardScheduler,
  stopRewardScheduler,
  notifyStub,
};
