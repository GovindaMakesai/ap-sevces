/**
 * Run all schema ensure scripts against DATABASE_URL (empty Supabase project).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const { ensureChatSchema } = require('../config/ensureChatSchema');
  const { ensurePaymentSchema } = require('../config/ensurePaymentSchema');
  const { ensureFoundationSchema } = require('../config/ensureFoundationSchema');
  const { ensurePhase2Schema } = require('../config/ensurePhase2Schema');
  const { ensureSocialProductionSchema } = require('../config/ensureSocialProductionSchema');
  const { ensureSecurityHardeningSchema } = require('../config/ensureSecurityHardeningSchema');
  const { ensureProductionReadinessSchema } = require('../config/ensureProductionReadinessSchema');
  const { ensureWithdrawalQrSchema } = require('../config/ensureWithdrawalQrSchema');

  await ensureChatSchema();
  await ensurePaymentSchema();
  await ensureFoundationSchema();
  await ensurePhase2Schema();
  await ensureWithdrawalQrSchema();
  await ensureSocialProductionSchema();
  await ensureSecurityHardeningSchema();
  await ensureProductionReadinessSchema();

  console.log('Schema ensure complete on', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
