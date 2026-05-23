const db = require('../config/database');
const walletService = require('./walletService');

/**
 * Atomic gift: debit sender, credit receiver (minus platform fee), log gift_transactions.
 */
async function sendGift({ senderId, receiverId, liveRoomId, giftType, coinAmount }) {
  const amount = BigInt(coinAmount);
  if (amount <= 0n) throw new Error('Gift amount must be positive');
  if (senderId === receiverId) throw new Error('Cannot gift yourself');

  const settings = await walletService.getWalletSettings();
  const feePct = BigInt(settings.gift_platform_fee_pct || 20);
  const platformFee = (amount * feePct) / 100n;
  const creatorAmount = amount - platformFee;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await walletService.debitCoins(
      senderId,
      Number(amount),
      {
        type: 'gift_sent',
        reference_type: 'gift',
        metadata: { receiver_id: receiverId, gift_type: giftType, live_room_id: liveRoomId },
      },
      client
    );

    await walletService.creditCoins(
      receiverId,
      Number(creatorAmount),
      {
        type: 'gift_received',
        reference_type: 'gift',
        metadata: { sender_id: senderId, gift_type: giftType, platform_fee: Number(platformFee) },
      },
      client
    );

    const gift = await client.query(
      `INSERT INTO gift_transactions (sender_id, receiver_id, live_room_id, gift_type, coin_amount, platform_fee, creator_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        senderId,
        receiverId,
        liveRoomId || null,
        giftType || 'gift',
        amount.toString(),
        platformFee.toString(),
        creatorAmount.toString(),
      ]
    );

    if (liveRoomId) {
      await client.query(
        `UPDATE live_room_members SET gift_count = gift_count + $1
         WHERE live_room_id = $2 AND user_id = $3 AND left_at IS NULL`,
        [amount.toString(), liveRoomId, receiverId]
      );
      await client.query(
        `INSERT INTO live_room_events (live_room_id, user_id, event_type, payload)
         VALUES ($1, $2, 'gift', $3)`,
        [
          liveRoomId,
          senderId,
          JSON.stringify({
            receiver_id: receiverId,
            gift_type: giftType,
            coin_amount: Number(amount),
            platform_fee: Number(platformFee),
          }),
        ]
      );
    }

    await client.query('COMMIT');
    return {
      gift: gift.rows[0],
      platform_fee: Number(platformFee),
      creator_amount: Number(creatorAmount),
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { sendGift };
