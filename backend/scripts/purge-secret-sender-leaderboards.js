#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const leaderboardService = require('../services/leaderboardService');

async function main() {
  const removed = await leaderboardService.purgeSecretSenderLeaderboards();
  console.log(`Purged ${removed} secret-sender gifter leaderboard rows`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
