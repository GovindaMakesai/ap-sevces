#!/usr/bin/env node
/**
 * One-shot: create points_transfers table on production.
 * Usage: node backend/scripts/ensure-points-transfer-schema.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ensurePointsTransferSchema, tableExists } = require('../config/ensurePointsTransferSchema');

(async () => {
  const ok = await ensurePointsTransferSchema();
  const exists = await tableExists();
  if (!ok || !exists) {
    console.error('FAILED: points_transfers table still missing');
    process.exit(1);
  }
  console.log('OK: points_transfers table ready');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
