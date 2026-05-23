const crypto = require('crypto');
const db = require('../config/database');
const transactionService = require('./transactionService');
const vipService = require('./vipService');
const auditLogService = require('./auditLogService');

const PROVIDERS = ['razorpay', 'stripe', 'manual'];

async function createIntent(userId, { amount_inr, provider = 'razorpay' }) {
  if (!PROVIDERS.includes(provider)) throw new Error('Unsupported payment provider');
  const walletService = require('./walletService');
  const settings = await walletService.getWalletSettings();
  const coins = Math.floor(Number(amount_inr) * settings.coins_per_inr);

  const res = await db.query(
    `INSERT INTO payment_intents (user_id, provider, amount_inr, coins_expected, status)
     VALUES ($1, $2, $3, $4, 'created') RETURNING *`,
    [userId, provider, amount_inr, coins]
  );
  return res.rows[0];
}

async function createRazorpayOrder(intentId) {
  const intent = await getIntent(intentId);
  if (!intent || intent.provider !== 'razorpay') throw new Error('Invalid intent');
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay not configured');

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const axios = require('axios');
  const amountPaise = Math.round(Number(intent.amount_inr) * 100);
  const { data } = await axios.post(
    'https://api.razorpay.com/v1/orders',
    { amount: amountPaise, currency: 'INR', receipt: intent.id, notes: { user_id: intent.user_id } },
    { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' } }
  );

  await db.query(
    `UPDATE payment_intents SET provider_ref = $1, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [data.id, intentId]
  );
  return { order_id: data.id, amount: amountPaise, currency: 'INR', key_id: keyId };
}

async function createStripeSession(intentId, successUrl, cancelUrl) {
  const intent = await getIntent(intentId);
  if (!intent || intent.provider !== 'stripe') throw new Error('Invalid intent');
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error('Stripe not configured');

  const Stripe = require('stripe');
  const stripe = new Stripe(stripeKey);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [{
      price_data: {
        currency: 'inr',
        product_data: { name: 'AP Services Coins' },
        unit_amount: Math.round(Number(intent.amount_inr) * 100),
      },
      quantity: 1,
    }],
    metadata: { payment_intent_id: intent.id, user_id: intent.user_id },
  });

  await db.query(
    `UPDATE payment_intents SET provider_ref = $1, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [session.id, intentId]
  );
  return { session_id: session.id, url: session.url };
}

async function getIntent(id) {
  const res = await db.query(`SELECT * FROM payment_intents WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function storeWebhookEvent(provider, eventId, payload) {
  const res = await db.query(
    `INSERT INTO payment_webhook_events (provider, event_id, payload)
     VALUES ($1, $2, $3) ON CONFLICT (provider, event_id) DO NOTHING RETURNING *`,
    [provider, eventId, JSON.stringify(payload)]
  );
  return res.rows[0] || null;
}

async function verifyRazorpayWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET not set');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected !== signature) throw new Error('Invalid Razorpay webhook signature');
  return true;
}

async function verifyStripeWebhook(rawBody, signature) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) throw new Error('Stripe webhook not configured');
  const Stripe = require('stripe');
  const stripe = new Stripe(stripeKey);
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

async function confirmPaidIntent(intentId, providerRef, metadata = {}) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const intentRes = await client.query(
      `SELECT * FROM payment_intents WHERE id = $1 FOR UPDATE`,
      [intentId]
    );
    const intent = intentRes.rows[0];
    if (!intent) throw new Error('Intent not found');
    if (intent.status === 'paid') {
      await client.query('COMMIT');
      return { already_processed: true };
    }

    const recharge = await client.query(
      `INSERT INTO recharges (user_id, amount_inr, coins_credited, payment_method, payment_status, transaction_id, provider, payment_intent_id)
       VALUES ($1, $2, $3, $4, 'approved', $5, $6, $7) RETURNING *`,
      [
        intent.user_id,
        intent.amount_inr,
        intent.coins_expected,
        intent.provider,
        providerRef,
        intent.provider,
        intent.id,
      ]
    );

    const walletService = require('./walletService');
    await walletService.creditCoins(
      intent.user_id,
      intent.coins_expected,
      {
        type: 'recharge',
        reference_type: 'payment_intent',
        reference_id: intent.id,
        metadata: { provider: intent.provider, provider_ref: providerRef, ...metadata },
      },
      client
    );

    await client.query(
      `UPDATE payment_intents SET status = 'paid', provider_ref = COALESCE(provider_ref, $2), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [intentId, providerRef]
    );

    await client.query('COMMIT');
    await vipService.recalculateVip(intent.user_id, Number(intent.amount_inr));
    await auditLogService.log(null, 'payment.confirmed', { entity_type: 'payment_intent', entity_id: intentId });
    return { intent, recharge: recharge.rows[0] };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function handleRazorpayWebhook(payload) {
  const eventId = payload.event + ':' + (payload.payload?.payment?.entity?.id || payload.created_at);
  const stored = await storeWebhookEvent('razorpay', eventId, payload);
  if (!stored) return { replay: true };

  if (payload.event === 'payment.captured') {
    const payment = payload.payload.payment.entity;
    const orderId = payment.order_id;
    const intentRes = await db.query(
      `SELECT * FROM payment_intents WHERE provider = 'razorpay' AND provider_ref = $1`,
      [orderId]
    );
    if (intentRes.rows.length) {
      await confirmPaidIntent(intentRes.rows[0].id, payment.id, { razorpay: payment });
    }
  }

  await db.query(
    `UPDATE payment_webhook_events SET processed = true, processed_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [stored.id]
  );
  return { ok: true };
}

async function handleStripeWebhook(event) {
  const stored = await storeWebhookEvent('stripe', event.id, event);
  if (!stored) return { replay: true };

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const intentId = session.metadata?.payment_intent_id;
    if (intentId) await confirmPaidIntent(intentId, session.payment_intent, { stripe_session: session.id });
  }

  await db.query(
    `UPDATE payment_webhook_events SET processed = true, processed_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [stored.id]
  );
  return { ok: true };
}

module.exports = {
  createIntent,
  createRazorpayOrder,
  createStripeSession,
  verifyRazorpayWebhook,
  verifyStripeWebhook,
  handleRazorpayWebhook,
  handleStripeWebhook,
  confirmPaidIntent,
};
