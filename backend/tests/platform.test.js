const { test } = require('node:test');
const assert = require('node:assert/strict');
const leaderboardService = require('../services/leaderboardService');
const agencyService = require('../services/agencyService');

test('leaderboard periodKey formats daily key', () => {
  const key = leaderboardService.periodKey('daily', new Date('2026-05-20T12:00:00Z'));
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('agency commission levels are defined', () => {
  assert.deepEqual(agencyService.COMMISSION_LEVELS, [12, 16, 20]);
});

test('commission level validation rejects invalid percent', async () => {
  const commissionService = require('../services/commissionService');
  await assert.rejects(
    () => commissionService.setAgencyCommissionLevel('00000000-0000-0000-0000-000000000001', 15),
    /Invalid commission level/
  );
});
