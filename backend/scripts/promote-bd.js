#!/usr/bin/env node
/**
 * Promote a user to BD (bdm) and ensure their promo code exists.
 * Usage: node backend/scripts/promote-bd.js <email>
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const hierarchyService = require('../services/hierarchyService');

const EMAIL = process.argv[2];

async function main() {
  if (!EMAIL) {
    console.error('Usage: node backend/scripts/promote-bd.js <email>');
    process.exit(1);
  }

  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, role, display_id FROM users WHERE email ILIKE $1`,
    [EMAIL.trim()]
  );
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found:', EMAIL);
    process.exit(1);
  }

  const profile = await hierarchyService.assignBd(null, user.id, {
    displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'BD',
    notes: 'Promoted via promote-bd.js for testing',
  });
  const promo = await hierarchyService.ensureBdPromoCode(user.id, null);

  console.log(
    JSON.stringify(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          previous_role: user.role,
          role: 'bdm',
          display_id: user.display_id,
        },
        bd_profile: { id: profile.id, status: profile.status },
        promo_code: promo.code,
        test_steps: [
          '1. Log in as this BD → open /bd-center.html?app=1 → copy promo code',
          '2. Log in as another user → /role-apply.html?app=1 → Agency → enter promo → Submit',
          '3. As BD → Accept Agency request',
          '4. Log in as third user → Host → same promo → Submit',
          '5. As BD → Accept Host (assigns to your agency)',
        ],
      },
      null,
      2
    )
  );
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
