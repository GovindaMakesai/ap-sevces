#!/usr/bin/env node
/**
 * Seed sample cosmetic products (safe to re-run — skips existing slugs).
 * Usage: node backend/scripts/seed-cosmetics.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const cosmeticService = require('../services/cosmeticService');

const SAMPLES = [
  {
    slug: 'royal-flame-frame',
    name: 'Royal Flame',
    description: 'Animated entry frame with golden flame border.',
    category: 'ENTRY_FRAME',
    thumbnailUrl: null,
    assetType: 'css',
    cssClass: 'ap-cosmetic-entry-royal-flame',
    variants: [
      { durationType: '1_DAY', durationDays: 1, priceCoins: 100 },
      { durationType: '7_DAYS', durationDays: 7, priceCoins: 500 },
      { durationType: '30_DAYS', durationDays: 30, priceCoins: 1500 },
      { durationType: 'PERMANENT', priceCoins: 5000 },
    ],
  },
  {
    slug: 'neon-bubble',
    name: 'Neon Bubble',
    description: 'Glowing chat bubble for live room messages.',
    category: 'CHAT_BUBBLE',
    assetType: 'css',
    cssClass: 'ap-cosmetic-bubble-neon',
    variants: [
      { durationType: '7_DAYS', durationDays: 7, priceCoins: 300 },
      { durationType: '30_DAYS', durationDays: 30, priceCoins: 900 },
      { durationType: 'PERMANENT', priceCoins: 3000 },
    ],
  },
  {
    slug: 'vip-king-tag',
    name: 'KING Tag',
    description: 'Exclusive profile tag beside your name.',
    category: 'PROFILE_TAG',
    tagLabel: 'KING',
    assetType: 'css',
    cssClass: 'ap-cosmetic-tag-king',
    variants: [
      { durationType: '30_DAYS', durationDays: 30, priceCoins: 800 },
      { durationType: 'PERMANENT', priceCoins: 2500 },
    ],
  },
  {
    slug: 'gold-id-glow',
    name: 'Gold Glow ID',
    description: 'Animated gold glow on your display ID.',
    category: 'ID_EFFECT',
    assetType: 'css',
    cssClass: 'ap-cosmetic-id-gold',
    variants: [
      { durationType: '7_DAYS', durationDays: 7, priceCoins: 400 },
      { durationType: '30_DAYS', durationDays: 30, priceCoins: 1200 },
    ],
  },
  {
    slug: 'pulse-mic',
    name: 'Pulse Mic',
    description: 'Pulsing ring when you speak on mic.',
    category: 'MIC_EFFECT',
    assetType: 'css',
    cssClass: 'ap-cosmetic-mic-pulse',
    variants: [
      { durationType: '7_DAYS', durationDays: 7, priceCoins: 350 },
      { durationType: '30_DAYS', durationDays: 30, priceCoins: 1000 },
    ],
  },
  {
    slug: 'starlight-ring',
    name: 'Starlight Ring',
    description: 'Shimmering ring around your avatar.',
    category: 'PROFILE_RING',
    assetType: 'css',
    cssClass: 'ap-cosmetic-ring-starlight',
    variants: [
      { durationType: '7_DAYS', durationDays: 7, priceCoins: 450 },
      { durationType: '30_DAYS', durationDays: 30, priceCoins: 1400 },
      { durationType: 'PERMANENT', priceCoins: 4000 },
    ],
  },
];

async function main() {
  await require('../config/ensureCosmeticsSchema').ensureCosmeticsSchema();
  const created = [];
  for (const sample of SAMPLES) {
    const exists = await db.query(`SELECT id FROM cosmetic_products WHERE slug = $1`, [sample.slug]);
    if (exists.rows.length) {
      created.push({ slug: sample.slug, skipped: true });
      continue;
    }
    const product = await cosmeticService.createProduct(sample);
    for (const v of sample.variants) {
      await cosmeticService.upsertVariant(product.id, v);
    }
    created.push({ slug: sample.slug, id: product.id });
  }
  console.log(JSON.stringify({ success: true, created }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
