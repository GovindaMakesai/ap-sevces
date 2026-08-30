#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const matchQueueStore = require('../services/matchQueueStore');

async function main() {
  const action = process.env.SMOKE_CHILD_SCRIPT;
  if (action === 'enqueue-a') {
    await matchQueueStore.enqueue('smoke-mq-a', 'voice', 'smoke-test');
    console.log('enqueued smoke-mq-a');
    return;
  }
  if (action === 'pop-b') {
    const partner = await matchQueueStore.popOldest('voice', 'smoke-mq-b');
    if (!partner) {
      console.error('no partner found');
      process.exit(1);
    }
    console.log(partner.userId);
    return;
  }
  console.error('unknown action');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
