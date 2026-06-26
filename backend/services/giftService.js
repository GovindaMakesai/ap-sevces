const db = require('../config/database');
const walletService = require('./walletService');
const platformService = require('./platformService');
const commissionService = require('./commissionService');
const leaderboardService = require('./leaderboardService');
const charityService = require('./charityService');
const fraudService = require('./fraudService');
const pkBattleService = require('./pkBattleService');

/**
 * Atomic gift: debit sender, credit receiver (minus platform fee), log gift_transactions.
 */
async function resolveGiftAmount(giftType, coinAmount) {
  const amount = Number(coinAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Gift amount must be positive');

  const raw = String(giftType || '').trim();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);

  let res = await db.query(
    `SELECT slug, coin_cost, emoji, name FROM gift_catalog
     WHERE is_active = TRUE AND (
       slug = $1 OR LOWER(name) = LOWER($2) OR emoji = $2
     )
     LIMIT 1`,
    [slug, raw]
  );

  if (!res.rows[0]) {
    const withCost = `${slug}_${amount}`;
    res = await db.query(
      `SELECT slug, coin_cost, emoji, name FROM gift_catalog
       WHERE is_active = TRUE AND slug = $1
       LIMIT 1`,
      [withCost]
    );
  }

  if (!res.rows[0]) {
    const byCost = await db.query(
      `SELECT slug, coin_cost FROM gift_catalog
       WHERE is_active = TRUE AND coin_cost = $1
       ORDER BY sort_order ASC`,
      [amount]
    );
    if (byCost.rows.length >= 1) {
      return amount;
    }
  }

  if (res.rows[0]) {
    const expected = Number(res.rows[0].coin_cost);
    if (amount !== expected) {
      return expected;
    }
    return expected;
  }

  throw new Error(`Unknown gift type "${raw || giftType}". Try reloading the app.`);
}

async function sendGift({ senderId, receiverId, liveRoomId, giftType, coinAmount }) {
  const amount = BigInt(await resolveGiftAmount(giftType, coinAmount));
  if (senderId === receiverId) throw new Error('Cannot gift yourself');

  await fraudService.checkGiftAbuse(senderId, Number(amount));

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

    const creditResult = await walletService.creditStars(
      receiverId,
      Number(creatorAmount),
      {
        type: 'gift_received',
        reference_type: 'gift',
        metadata: { sender_id: senderId, gift_type: giftType, platform_fee: Number(platformFee) },
      },
      client
    );

    if (Number(platformFee) > 0) {
      await platformService.creditPlatformFee(Number(platformFee), {
        reference_type: 'gift',
        metadata: { sender_id: senderId, receiver_id: receiverId },
      }, client);
    }

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

    await commissionService.distributeFromGift({
      sourceUserId: receiverId,
      creatorAmount: Number(creatorAmount),
      giftTransactionId: gift.rows[0].id,
      walletTransactionId: creditResult.transaction.id,
      client,
    });

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

      const room = await client.query(`SELECT channel FROM live_rooms WHERE id = $1`, [liveRoomId]);
      if (room.rows[0]?.channel) {
        const battle = await pkBattleService.getActiveBattleByChannel(room.rows[0].channel);
        if (battle) {
          await pkBattleService.addGiftScore(battle.id, receiverId, Number(amount));
        }
      }
    }

    await client.query('COMMIT');

    await leaderboardService.ingestGiftLeaderboards(gift.rows[0]);
    await charityService.allocateFromGift(Number(amount), gift.rows[0].id);

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
