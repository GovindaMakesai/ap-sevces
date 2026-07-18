#!/usr/bin/env node
/**
 * Backfill invite 2h stream missions using live_host_stat_daily hours.
 * Usage: node backend/scripts/backfill-invite-stream-missions.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const missionEngine = require('../modules/referral/services/missionEngine');

async function main() {
  await missionEngine.ensureCanonicalMissions().catch(() => {});

  const invitees = await db.query(
    `SELECT DISTINCT ON (r.invitee_id)
            r.invitee_id, r.applied_at,
            iee.display_id, iee.first_name, iee.last_name,
            inv.display_id AS inviter_display_id, inv.first_name AS inviter_first
     FROM referrals r
     JOIN users iee ON iee.id = r.invitee_id
     JOIN users inv ON inv.id = r.inviter_id
     WHERE r.status IN ('valid', 'rewarded')
     ORDER BY r.invitee_id, r.applied_at DESC`
  );

  const results = [];
  for (const row of invitees.rows) {
    try {
      const synced = await missionEngine.syncUserMissions(row.invitee_id);
      const twoH = (synced || []).find((x) => x?.mission?.slug === 'broadcast_2h');
      results.push({
        invitee: row.display_id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        inviter: row.inviter_display_id,
        progress: twoH?.progress?.progress_value ?? null,
        status: twoH?.progress?.status ?? null,
        percent: twoH?.percent ?? null,
        locked: twoH?.locked ?? null,
      });
    } catch (e) {
      results.push({ invitee: row.display_id, error: e.message });
    }
  }

  const unlocked = results.filter((r) => Number(r.progress) >= 2 || r.status === 'claimed' || r.status === 'completed');
  console.log(
    JSON.stringify(
      {
        invitees_synced: results.length,
        unlocked_or_2h: unlocked.length,
        unlocked,
        sample: results.filter((r) => Number(r.progress) > 0).slice(0, 25),
      },
      null,
      2
    )
  );

  /* Show inviter pending mission points after backfill */
  const pending = await db.query(
    `SELECT u.display_id, u.first_name, u.last_name,
            COUNT(*)::int AS mission_rewards,
            COALESCE(SUM(rr.coins),0)::bigint AS pending_points
     FROM referral_rewards rr
     JOIN users u ON u.id = rr.beneficiary_id
     WHERE rr.reward_type = 'mission'
       AND rr.status IN ('pending', 'approved', 'scheduled')
     GROUP BY u.display_id, u.first_name, u.last_name
     ORDER BY pending_points DESC`
  );
  console.log('\nInviters with pending mission points:');
  console.log(JSON.stringify(pending.rows, null, 2));

  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
