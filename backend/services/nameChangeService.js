const db = require('../config/database');
const walletService = require('./walletService');
const { ensureNameChangeSchema } = require('../config/ensureNameChangeSchema');

const FREE_NAME_CHANGES_PER_MONTH = 2;
const NAME_CHANGE_FEE_COINS = 10000;

function normalizeDisplayName(first, last) {
  return `${String(first || '').trim()} ${String(last || '').trim()}`.trim().replace(/\s+/g, ' ');
}

async function countNameChangesThisMonth(userId, client) {
  const q = client || db;
  const res = await q.query(
    `SELECT COUNT(*)::int AS n
     FROM user_name_change_log
     WHERE user_id = $1
       AND changed_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
           AT TIME ZONE 'Asia/Kolkata'`,
    [userId]
  );
  return Number(res.rows[0]?.n || 0);
}

async function getNameChangeQuota(userId) {
  await ensureNameChangeSchema();
  const used = await countNameChangesThisMonth(userId);
  const freeLeft = Math.max(0, FREE_NAME_CHANGES_PER_MONTH - used);
  const nextChangeCosts = used >= FREE_NAME_CHANGES_PER_MONTH ? NAME_CHANGE_FEE_COINS : 0;
  return {
    used,
    free_limit: FREE_NAME_CHANGES_PER_MONTH,
    free_left: freeLeft,
    fee_coins: NAME_CHANGE_FEE_COINS,
    next_change_costs: nextChangeCosts,
  };
}

/**
 * If the display name is changing, enforce 2 free / month then 10,000 coins.
 * Returns { charged, quota } or throws with code INSUFFICIENT_BALANCE / NAME_UNCHANGED handled by caller.
 */
async function applyNameChangePolicy({ userId, oldUser, nextFirst, nextLast }) {
  await ensureNameChangeSchema();
  const oldName = normalizeDisplayName(oldUser?.first_name, oldUser?.last_name);
  const newName = normalizeDisplayName(
    nextFirst !== undefined ? nextFirst : oldUser?.first_name,
    nextLast !== undefined ? nextLast : oldUser?.last_name
  );
  if (!newName || oldName === newName) {
    return { changed: false, charged: 0, quota: await getNameChangeQuota(userId) };
  }

  const used = await countNameChangesThisMonth(userId);
  const mustPay = used >= FREE_NAME_CHANGES_PER_MONTH;
  let charged = 0;

  if (mustPay) {
    try {
      await walletService.debitCoins(userId, NAME_CHANGE_FEE_COINS, {
        type: 'name_change_fee',
        reference_type: 'name_change',
        reference_id: String(userId),
        metadata: {
          old_name: oldName,
          new_name: newName,
          month_change_index: used + 1,
        },
      });
      charged = NAME_CHANGE_FEE_COINS;
    } catch (err) {
      if (err.code === 'INSUFFICIENT_BALANCE') {
        const e = new Error(
          `Name change costs ${NAME_CHANGE_FEE_COINS.toLocaleString()} coins after 2 free updates this month. Not enough coins.`
        );
        e.code = 'INSUFFICIENT_BALANCE';
        e.status = 402;
        throw e;
      }
      throw err;
    }
  }

  await db.query(
    `INSERT INTO user_name_change_log (user_id, old_name, new_name, coins_charged)
     VALUES ($1, $2, $3, $4)`,
    [userId, oldName, newName, charged]
  );

  return {
    changed: true,
    charged,
    quota: await getNameChangeQuota(userId),
  };
}

module.exports = {
  FREE_NAME_CHANGES_PER_MONTH,
  NAME_CHANGE_FEE_COINS,
  getNameChangeQuota,
  applyNameChangePolicy,
  normalizeDisplayName,
};
