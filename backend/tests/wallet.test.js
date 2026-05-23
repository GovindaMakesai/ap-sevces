const { test } = require('node:test');
const assert = require('node:assert/strict');

test('wallet debit rejects non-positive amounts', async () => {
  const walletService = require('../services/walletService');
  await assert.rejects(
    () => walletService.creditCoins('00000000-0000-0000-0000-000000000001', 0),
    /positive/
  );
});

test('gift rejects self-gift', async () => {
  const giftService = require('../services/giftService');
  await assert.rejects(
    () => giftService.sendGift({
      senderId: 'a',
      receiverId: 'a',
      coinAmount: 10,
    }),
    /Cannot gift yourself/
  );
});
