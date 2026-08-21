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

const PRIMARY_ROLE_PRIORITY = [
  'super_admin',
  'admin',
  'founder',
  'ceo',
  'bdm',
  'agency',
  'creator',
  'coin_seller',
  'worker',
  'vip_user',
  'customer',
];

function normalizeRoleSlug(roleSlug) {
  const slug = String(roleSlug || 'customer').toLowerCase().trim();
  if (slug === 'host') return 'creator';
  if (slug === 'seller') return 'coin_seller';
  if (slug === 'bd') return 'bdm';
  return slug;
}

function pickPrimaryRole(slugs) {
  const set = new Set((slugs || []).map(normalizeRoleSlug).filter((s) => ALLOWED_ROLES.has(s)));
  for (const slug of PRIMARY_ROLE_PRIORITY) {
    if (set.has(slug)) return slug;
  }
  return 'customer';
}

async function getUserRoleSlugs(userId) {
  const slugs = new Set();
  const userRes = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  if (!userRes.rows.length) return slugs;
  slugs.add(legacyRoleToSlug(userRes.rows[0].role));
  const extra = await db.query(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
    [userId]
  );
  extra.rows.forEach((r) => slugs.add(r.slug));
  return slugs;
}

async function userHasRole(userId, roleSlug) {
  const slug = normalizeRoleSlug(roleSlug);
  const slugs = await getUserRoleSlugs(userId);
  return slugs.has(slug);
}

async function decorateUserRoles(user) {
  if (!user || !user.id) return user;
  const slugs = await getUserRoleSlugs(user.id);
  const primary = String(user.role || '').toLowerCase();
  if (primary) slugs.add(legacyRoleToSlug(primary));
  user.roles = [...slugs];
  user.is_agency = slugs.has('agency') || primary === 'agency';
  user.is_coin_seller = slugs.has('coin_seller') || primary === 'coin_seller';
  return user;
}

async function getUserPermissions(userId) {
  const key = String(userId || '');
  const hit = permCache.get(key);
  if (hit && Date.now() - hit.at < PERM_TTL_MS) return hit.perms;

  const slugs = await getUserRoleSlugs(userId);
  if (!slugs.size) return [];

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

async function insertUserRoleRow(userId, slug) {
  await db.query(
    `INSERT INTO roles (slug, name, description) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO NOTHING`,
    [slug, slug.replace(/_/g, ' '), slug]
  );
  const roleRow = await db.query(`SELECT id FROM roles WHERE slug = $1`, [slug]);
  if (!roleRow.rows[0]) return false;
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    userId,
    roleRow.rows[0].id,
  ]);
  return true;
}

async function addUserRole(userId, roleSlug) {
  const slug = normalizeRoleSlug(roleSlug);
  if (!ALLOWED_ROLES.has(slug)) throw new Error(`Invalid role: ${slug}`);
  const current = await db.query(`SELECT role FROM users WHERE id = $1`, [userId]);
  if (!current.rows[0]) throw new Error('User not found');
  await insertUserRoleRow(userId, slug);
  const primaryNow = String(current.rows[0].role || 'customer').toLowerCase();
  if (!primaryNow || ['customer', 'user', 'worker'].includes(primaryNow)) {
    await db.query(`UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [slug, userId]);
  }
  invalidateUserPermissions(userId);
  return slug;
}

async function setUserRoles(userId, roleSlugs) {
  const unique = [
    ...new Set((Array.isArray(roleSlugs) ? roleSlugs : [roleSlugs]).map(normalizeRoleSlug).filter((s) => ALLOWED_ROLES.has(s))),
  ];
  if (!unique.length) unique.push('customer');
  const primary = pickPrimaryRole(unique);
  await db.query(`UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [primary, userId]);
  await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
  for (const slug of unique) {
    await insertUserRoleRow(userId, slug);
  }
  invalidateUserPermissions(userId);
  return { primary, roles: unique };
}

async function syncUserRole(userId, roleSlug) {
  const slug = normalizeRoleSlug(roleSlug);
  if (!ALLOWED_ROLES.has(slug)) throw new Error(`Invalid role: ${slug}`);
  await db.query(`UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [slug, userId]);
  await insertUserRoleRow(userId, slug);
  invalidateUserPermissions(userId);
  return slug;
}

module.exports = {
  legacyRoleToSlug,
  getUserPermissions,
  userHasPermission,
  userHasRole,
  getUserRoleSlugs,
  decorateUserRoles,
  addUserRole,
  setUserRoles,
  syncUserRole,
  pickPrimaryRole,
  invalidateUserPermissions,
  ALLOWED_ROLES,
};
