#!/usr/bin/env node
/**
 * One-shot: create CP module tables on production.
 * Usage: node backend/scripts/ensure-cp-schema.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ensureCpSchema, tableExists } = require('../config/ensureCpSchema');

(async () => {
  const ok = await ensureCpSchema();
  const exists = await tableExists('user_cp_support');
  if (!ok || !exists) {
    console.error('FAILED: user_cp_support table still missing');
    process.exit(1);
  }
  console.log('OK: CP module tables ready (user_cp_support, cp_relationships, …)');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
