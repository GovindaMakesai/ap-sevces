const db = require('../config/database');

async function getActiveCampaigns() {
  const res = await db.query(
    `SELECT c.*, COALESCE(f.balance_inr, 0) AS fund_balance
     FROM charity_campaigns c
     LEFT JOIN charity_funds f ON f.campaign_id = c.id
     WHERE c.status = 'active' ORDER BY c.created_at DESC`
  );
  return res.rows;
}

async function recordDonation({ campaignId, sourceType, sourceId, amountInr, metadata = {} }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const tx = await client.query(
      `INSERT INTO charity_transactions (campaign_id, source_type, source_id, amount_inr, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [campaignId, sourceType, sourceId, amountInr, JSON.stringify(metadata)]
    );
    await client.query(
      `INSERT INTO charity_funds (campaign_id, balance_inr) VALUES ($1, $2)
       ON CONFLICT (campaign_id) DO UPDATE SET balance_inr = charity_funds.balance_inr + $2, updated_at = CURRENT_TIMESTAMP`,
      [campaignId, amountInr]
    );
    await client.query(
      `UPDATE charity_campaigns SET raised_amount_inr = raised_amount_inr + $1 WHERE id = $2`,
      [amountInr, campaignId]
    );
    await client.query('COMMIT');
    return tx.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function allocateFromGift(giftAmountCoins, giftTransactionId) {
  const settings = await db.query(`SELECT value FROM platform_settings WHERE key = 'charity' LIMIT 1`);
  const pct = Number(settings.rows[0]?.value?.default_donation_pct || 1);
  const walletSettings = await require('./walletService').getWalletSettings();
  const amountInr = (Number(giftAmountCoins) / walletSettings.coins_per_inr) * (pct / 100);

  const campaign = await db.query(
    `SELECT id FROM charity_campaigns WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`
  );
  if (!campaign.rows.length || amountInr <= 0) return null;

  return recordDonation({
    campaignId: campaign.rows[0].id,
    sourceType: 'gift',
    sourceId: giftTransactionId,
    amountInr,
    metadata: { gift_coins: giftAmountCoins, pct },
  });
}

module.exports = { getActiveCampaigns, recordDonation, allocateFromGift };
