const db = require('../config/database');
const walletService = require('./walletService');
const commissionService = require('./commissionService');
const leaderboardService = require('./leaderboardService');
const charityService = require('./charityService');
const fraudService = require('./fraudService');
const pkBattleService = require('./pkBattleService');
const { isSecretGiftSender } = require('../lib/secretGiftSender');
const { toJsonb } = require('../lib/pgJsonb');

const CATALOG_TTL_MS = 60000;
let catalogMemo = { at: 0, rows: null };

async function getActiveCatalog() {
  if (catalogMemo.rows && Date.now() - catalogMemo.at < CATALOG_TTL_MS) {
    return catalogMemo.rows;
  }
  const res = await db.query(
    `SELECT slug, emoji, name, coin_cost, category, tier
     FROM gift_catalog
     WHERE is_active = TRUE
     ORDER BY category, sort_order, coin_cost`
  );
  catalogMemo = { at: Date.now(), rows: res.rows };
  return res.rows;
}

function findCatalogGift(rows, giftType, amount, quantity) {
  const raw = String(giftType || '').trim();
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);
  const lower = raw.toLowerCase();
  let hit =
    rows.find((r) => r.slug === slug) ||
    rows.find((r) => String(r.name || '').toLowerCase() === lower) ||
    rows.find((r) => r.emoji === raw);
  if (!hit) hit = rows.find((r) => r.slug === `${slug}_${amount}`);
  if (!hit) {
    const unitGuess = Math.floor(amount / quantity);
    if (unitGuess > 0 && amount % quantity === 0) {
      hit = rows.find((r) => r.slug === `${slug}_${unitGuess}`);
    }
  }
  return hit || null;
}

/**
 * Resolve chargeable gift total.
 * Catalog unit cost is authoritative; client may send total (unit * qty) or unit + qty.
 * Never silently clamp a multi-qty total down to unit cost.
 */
async function resolveGiftAmount(giftType, coinAmount, qty = 1) {
  const amount = Number(coinAmount);
  const quantity = Math.max(1, Math.min(10000, Math.floor(Number(qty) || 1)));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Gift amount must be positive');

  const rows = await getActiveCatalog();
  const hit = findCatalogGift(rows, giftType, amount, quantity);

  if (!hit) {
    if (rows.some((r) => Number(r.coin_cost) === amount)) return amount;
    throw new Error(`Unknown gift type "${String(giftType || '').trim() || giftType}". Try reloading the app.`);
  }

  const unit = Number(hit.coin_cost);
  if (!Number.isFinite(unit) || unit <= 0) {
    throw new Error('Invalid gift catalog cost');
  }
  if (amount >= unit && amount % unit === 0) return amount;
  return unit * quantity;
}

async function sendGift({
  senderId,
  receiverId,
  liveRoomId,
  giftType,
  coinAmount,
  qty = 1,
  emoji = null,
  fromName = null,
  toName = null,
}) {
  const amount = BigInt(await resolveGiftAmount(giftType, coinAmount, qty));
  if (Number(amount) > 10000000) {
    throw new Error('Maximum gift is 10,000,000 coins');
  }
  if (String(senderId) === String(receiverId)) throw new Error('Cannot gift yourself');

  await fraudService.checkGiftAbuse(senderId, Number(amount));
  const secretSender = await isSecretGiftSender(senderId, db);
  const publicFromName = secretSender ? 'Secret Fan' : fromName;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const coinSellerService = require('./coinSellerService');
    const debitResult = await coinSellerService.debitGiftSpend(
      senderId,
      Number(amount),
      {
        type: 'gift_sent',
        reference_type: 'gift',
        metadata: {
          receiver_id: receiverId,
          gift_type: giftType,
          live_room_id: liveRoomId,
          qty: Math.max(1, Math.floor(Number(qty) || 1)),
          charged: Number(amount),
        },
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
        String(giftType || 'gift').slice(0, 64),
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
         VALUES ($1, $2, 'gift', $3::jsonb)`,
        [
          liveRoomId,
          senderId,
          toJsonb({
            gift_tx_id: gift.rows[0].id,
            fromUserId: secretSender ? null : senderId,
            toUserId: receiverId,
            receiver_id: receiverId,
            gift_type: giftType,
            emoji: emoji || giftType,
            from: publicFromName || null,
            to: toName || null,
            amount: Number(amount),
            coin_amount: Number(amount),
            qty: Math.max(1, Math.floor(Number(qty) || 1)),
            platform_fee: Number(platformShare),
            host_amount: Number(hostShare),
            secret: secretSender || undefined,
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

    /* Leaderboards, CP, charity, analytics, push — not needed to ack the send. */
    setImmediate(() => {
      (async () => {
        try {
          const cpService = require('./cpService');
          const coinAmt = Number(amount);
          if (coinAmt > 0 && !secretSender) {
            await cpService.addSupportPoints(senderId, receiverId, Math.floor(coinAmt / 10));
          }
        } catch (_cp) { /* non-fatal */ }
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
          await recordGiftStats(senderId, receiverId, Number(amount), Number(hostShare), {
            skipSender: secretSender,
          });
        } catch (_e) {}
        try {
          if (!secretSender) {
            await leaderboardService.ingestGiftLeaderboards(giftRow);
          } else {
            await leaderboardService.ingestGiftLeaderboardsReceiverOnly(giftRow);
          }
        } catch (err) {
          console.warn('[gift] leaderboard', err.message);
        }
        try {
          await charityService.allocateFromGift(Number(amount), giftRow.id);
        } catch (err) {
          console.warn('[gift] charity', err.message);
        }
        try {
          const pushNotificationService = require('./pushNotificationService');
          await pushNotificationService.notifyGiftReceived(receiverId, senderId, giftRow.id);
        } catch (err) {
          console.warn('[gift] push failed', err.message);
        }
      })().catch((err) => console.warn('[gift] post-settle', err.message));
    });

    const coinBal = Number(debitResult.balance);
    const giftInv = Number(debitResult.gift_inventory_coins || 0);
    const sellerGiftOnly = Number(debitResult.from_wallet || 0) === 0;
    const giftable = sellerGiftOnly ? giftInv : coinBal;
    return {
      gift: giftRow,
      platform_fee: Number(platformShare),
      creator_amount: Number(hostShare),
      settlement,
      secretSender,
      sender_balance: {
        coin_balance: coinBal,
        gift_inventory_coins: giftInv,
        giftable_coins: giftable,
        is_coin_seller: sellerGiftOnly,
      },
      balance: {
        coin_balance: coinBal,
        gift_inventory_coins: giftInv,
        giftable_coins: giftable,
        is_coin_seller: sellerGiftOnly,
      },
    };
  } catch (e) {
    await db.safeRollback(client);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { sendGift, getActiveCatalog };
