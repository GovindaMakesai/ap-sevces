const db = require('../config/database');
const walletService = require('./walletService');
const agencyService = require('./agencyService');

async function getCommissionSettings() {
  const res = await db.query(`SELECT value FROM platform_settings WHERE key = 'commission' LIMIT 1`);
  return {
    levels: agencyService.COMMISSION_LEVELS,
    upgrade_threshold_inr: 50000,
    downgrade_threshold_inr: 20000,
    ...(res.rows[0]?.value || {}),
  };
}

/**
 * Distribute agency commissions up the hierarchy from a gift/creator revenue event.
 * Each agency in chain receives a slice of creator_amount based on their commission_percent delta.
 */
async function distributeFromGift({ sourceUserId, creatorAmount, giftTransactionId, walletTransactionId, client }) {
  const c = client || db;
  const q = c.query.bind(c);
  const chain = await agencyService.getUserAgencyChain(sourceUserId);
  if (!chain.length) return [];

  const settings = await getCommissionSettings();
  let remaining = BigInt(creatorAmount);
  const records = [];
  const periodMonth = new Date().toISOString().slice(0, 7) + '-01';

  for (let i = 0; i < chain.length && remaining > 0n; i++) {
    const agency = chain[i];
    const pct = BigInt(Math.round(Number(agency.commission_percent)));
    const slice = (BigInt(creatorAmount) * pct) / 100n;
    if (slice <= 0n) continue;

    const payAmount = slice > remaining ? remaining : slice;
    remaining -= payAmount;

    await walletService.creditCoins(
      agency.owner_user_id,
      Number(payAmount),
      {
        type: 'agency_commission',
        reference_type: 'agency_commission',
        reference_id: giftTransactionId,
        metadata: { agency_id: agency.id, source_user_id: sourceUserId },
      },
      client
    );

    const rec = await q(
      `INSERT INTO agency_commissions (agency_id, source_user_id, transaction_id, gift_transaction_id, commission_percent, commission_amount, period_month)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        agency.id,
        sourceUserId,
        walletTransactionId || null,
        giftTransactionId,
        agency.commission_percent,
        payAmount.toString(),
        periodMonth,
      ]
    );
    records.push(rec.rows[0]);

    await q(
      `UPDATE agencies SET total_income = total_income + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [payAmount.toString(), agency.id]
    );
  }

  return records;
}

async function setAgencyCommissionLevel(agencyId, levelPercent) {
  if (!agencyService.COMMISSION_LEVELS.includes(levelPercent)) {
    throw new Error(`Invalid commission level: ${levelPercent}`);
  }
  const res = await db.query(
    `UPDATE agencies SET commission_percent = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [levelPercent, agencyId]
  );
  return res.rows[0];
}

module.exports = {
  getCommissionSettings,
  distributeFromGift,
  setAgencyCommissionLevel,
};
