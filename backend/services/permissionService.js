const db = require('../config/database');

/** Maps legacy users.role to RBAC role slug */
function legacyRoleToSlug(role) {
  if (role === 'admin') return 'super_admin';
  return role || 'customer';
}

async function getUserPermissions(userId) {
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
  return permRes.rows.map((r) => r.slug);
}

async function userHasPermission(userId, permissionSlug) {
  const perms = await getUserPermissions(userId);
  return perms.includes(permissionSlug);
}

module.exports = { legacyRoleToSlug, getUserPermissions, userHasPermission };
