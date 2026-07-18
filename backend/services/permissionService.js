const db = require('../config/database');

/** Maps legacy users.role to RBAC role slug */
function legacyRoleToSlug(role) {
  if (role === 'admin') return 'super_admin';
  return role || 'customer';
}

/** Short TTL cache — live join hits this on every connection */
const permCache = new Map();
const PERM_TTL_MS = 60_000;

function invalidateUserPermissions(userId) {
  if (userId) permCache.delete(String(userId));
}

async function getUserPermissions(userId) {
  const key = String(userId || '');
  const hit = permCache.get(key);
  if (hit && Date.now() - hit.at < PERM_TTL_MS) return hit.perms;

  const userRes = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  if (!userRes.rows.length) return [];

  const slugs = new Set();
  slugs.add(legacyRoleToSlug(userRes.rows[0].role));

  const extra = await db.query(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
    [userId]
  );
  extra.rows.forEach((r) => slugs.add(r.slug));

  const permRes = await db.query(
    `SELECT DISTINCT p.slug FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN roles r ON r.id = rp.role_id
     WHERE r.slug = ANY($1::text[])`,
    [[...slugs]]
  );
  const perms = permRes.rows.map((r) => r.slug);
  permCache.set(key, { perms, at: Date.now() });
  return perms;
}

async function userHasPermission(userId, permissionSlug) {
  const perms = await getUserPermissions(userId);
  return perms.includes(permissionSlug);
}

const ALLOWED_ROLES = new Set([
  'customer',
  'worker',
  'admin',
  'super_admin',
  'founder',
  'ceo',
  'coin_seller',
  'creator',
  'agency',
  'vip_user',
  'bdm',
]);

async function syncUserRole(userId, roleSlug) {
  const slug = String(roleSlug || 'customer').toLowerCase();
  if (!ALLOWED_ROLES.has(slug)) throw new Error(`Invalid role: ${slug}`);
  await db.query(`UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [slug, userId]);
  const roleRow = await db.query(`SELECT id FROM roles WHERE slug = $1`, [slug]);
  if (roleRow.rows[0]) {
    await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      userId,
      roleRow.rows[0].id,
    ]);
  }
  invalidateUserPermissions(userId);
  return slug;
}

module.exports = {
  legacyRoleToSlug,
  getUserPermissions,
  userHasPermission,
  syncUserRole,
  invalidateUserPermissions,
  ALLOWED_ROLES,
};
