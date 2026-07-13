const db = require('../config/database');
const walletService = require('./walletService');
const commissionService = require('./commissionService');
const leaderboardService = require('./leaderboardService');
const charityService = require('./charityService');
const fraudService = require('./fraudService');
const pkBattleService = require('./pkBattleService');

/**
 * Atomic gift with configurable Host/Agency/BD/Platform split.
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

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const debitResult = await walletService.debitCoins(
      senderId,
      Number(amount),
      {
        type: 'gift_sent',
        reference_type: 'gift',
        metadata: { receiver_id: receiverId, gift_type: giftType, live_room_id: liveRoomId },
      },
      client
    );

    // Insert gift row first so settlement can reference gift_id
    const gift = await client.query(
      `INSERT INTO gift_transactions (sender_id, receiver_id, live_room_id, gift_type, coin_amount, platform_fee, creator_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        senderId,
        receiverId,
        liveRoomId || null,
        giftType || 'gift',
        amount.toString(),
        '0',
        '0',
      ]
    );

    const settlement = await commissionService.settleGift({
      giftId: gift.rows[0].id,
      hostUserId: receiverId,
      grossCoins: Number(amount),
      senderId,
      giftType,
      client,
    });

    const hostShare = settlement.find((s) => s.role === 'host')?.amount || 0;
    const platformShare = settlement
      .filter((s) => s.role === 'platform')
      .reduce((n, s) => n + Number(s.amount || 0), 0);

    await client.query(
      `UPDATE gift_transactions
       SET platform_fee = $1, creator_amount = $2
       WHERE id = $3`,
      [String(platformShare), String(hostShare), gift.rows[0].id]
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
            platform_fee: Number(platformShare),
            host_amount: Number(hostShare),
            settlement,
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

    const giftRow = {
      ...gift.rows[0],
      platform_fee: String(platformShare),
      creator_amount: String(hostShare),
    };

    try {
      const agencyShare = settlement.find((s) => s.role === 'agency');
      if (agencyShare?.amount && agencyShare.userId) {
        const { resolveGiftParties } = require('./hierarchyService');
        const parties = await resolveGiftParties(receiverId);
        if (parties.agencyId) {
          const agencyPerformanceService = require('./agencyPerformanceService');
          await agencyPerformanceService.recordGiftRevenue(parties.agencyId, Number(agencyShare.amount));
        }
      }
    } catch (_e) {}

    try {
      const { recordGiftStats } = require('./liveUserAnalyticsService');
      await recordGiftStats(senderId, receiverId, Number(amount), Number(hostShare));
    } catch (_e) {}

    await leaderboardService.ingestGiftLeaderboards(giftRow);
    await charityService.allocateFromGift(Number(amount), giftRow.id);

    return {
      gift: giftRow,
      platform_fee: Number(platformShare),
      creator_amount: Number(hostShare),
      settlement,
      sender_balance: {
        coin_balance: Number(debitResult.balance),
      },
    };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { sendGift };
