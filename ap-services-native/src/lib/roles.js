export function roleOf(user) {
  return String(user?.role || user?.user_type || '').toLowerCase();
}

const PLATFORM_OWNER_EMAIL = 'developer.govinda00@gmail.com';

function isOwnerEmail(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(email) && email === PLATFORM_OWNER_EMAIL;
}

export function isPlatformAdmin(user) {
  if (!user) return false;
  if (isOwnerEmail(user)) return true;
  if (user.is_admin === true || user.isAdmin === true || user.isPlatformAdmin === true) return true;
  return ['admin', 'super_admin', 'founder', 'ceo'].includes(roleOf(user));
}

/** Super Admin / founder / ceo — full control including user details */
export function isSuperAdmin(user) {
  if (!user) return false;
  if (isOwnerEmail(user)) return true;
  if (user.is_super_admin === true || user.isSuperAdmin === true) return true;
  return ['super_admin', 'founder', 'ceo'].includes(roleOf(user));
}

/** Default powers for role=admin (ops). Super Admin can grant more via admin_caps. */
export const DEFAULT_OPS_CAPS = ['payments', 'withdrawals', 'agora'];

export const ALL_ADMIN_CAPS = [
  'payments',
  'withdrawals',
  'agora',
  'users',
  'applications',
  'network',
  'analytics',
  'operations',
  'settings',
  'live',
  'sellers',
];

export const ADMIN_CAP_CATALOG = [
  { id: 'payments', label: 'Payments & recharges', desc: 'Approve or reject coin top-ups and booking payments' },
  { id: 'withdrawals', label: 'Withdrawals', desc: 'Approve or reject cash-out requests' },
  { id: 'agora', label: 'Agora & live tools', desc: 'Update live streaming App ID and certificate' },
  { id: 'users', label: 'User details', desc: 'View and edit any user profile, ban, wallet, roles' },
  { id: 'applications', label: 'Role applications', desc: 'Approve host / agency / seller applications' },
  { id: 'network', label: 'BD & agencies', desc: 'Hierarchy, BD assign, and commission tools' },
  { id: 'analytics', label: 'Analytics & reports', desc: 'Platform stats, charts, and generated reports' },
  { id: 'operations', label: 'Operations', desc: 'Workers, services, bookings, reviews' },
  { id: 'settings', label: 'Platform settings', desc: 'Announcements and global settings' },
  { id: 'live', label: 'Live moderation', desc: 'Kick users, oversee live/party rooms' },
  { id: 'sellers', label: 'Coin sellers', desc: 'Seller stock top-ups and seller tools' },
];

export function adminCapsOf(user) {
  if (!user || !isPlatformAdmin(user)) return [];
  if (isSuperAdmin(user)) return [...ALL_ADMIN_CAPS];
  const raw = user.admin_caps || user.adminCaps;
  if (raw == null) return [...DEFAULT_OPS_CAPS];
  if (Array.isArray(raw)) {
    return raw.map((c) => String(c || '').toLowerCase()).filter((c) => ALL_ADMIN_CAPS.includes(c));
  }
  return [...DEFAULT_OPS_CAPS];
}

export function hasAdminCap(user, ...needed) {
  if (!needed.length) return isPlatformAdmin(user);
  if (isSuperAdmin(user)) return true;
  const caps = adminCapsOf(user);
  return needed.some((c) => caps.includes(String(c).toLowerCase()));
}

export function isCoinSeller(user) {
  return roleOf(user) === 'coin_seller' || roleOf(user) === 'seller' || user?.is_coin_seller === true;
}

export function isAgency(user) {
  return ['agency', 'admin', 'super_admin'].includes(roleOf(user)) || isPlatformAdmin(user);
}

export function isHost(user) {
  return ['creator', 'host'].includes(roleOf(user));
}

export function isBd(user) {
  return ['bdm', 'bd', 'admin', 'super_admin', 'founder', 'ceo'].includes(roleOf(user)) || isPlatformAdmin(user);
}

export function isWorker(user) {
  return roleOf(user) === 'worker';
}

export function hideRoleApply(user) {
  return ['agency', 'creator', 'host', 'coin_seller', 'seller', 'bdm', 'bd', 'admin', 'super_admin', 'founder', 'ceo'].includes(roleOf(user));
}

export function formatUserDisplayId(user) {
  if (!user) return '';
  const candidates = [
    user.display_id,
    user.displayId,
    user.public_id,
    user.publicId,
    user.user_display_id,
    user.short_id,
    user.numeric_id,
  ];
  for (const c of candidates) {
    const s = String(c == null ? '' : c).trim();
    if (/^\d{6,8}$/.test(s)) return s;
  }
  return '';
}

export function hierarchyKeys(user) {
  const keys = [];
  const push = (k) => {
    if (k && !keys.includes(k)) keys.push(k);
  };
  if (isPlatformAdmin(user)) push('admin');
  const r = roleOf(user);
  if (r === 'bdm' || r === 'bd') push('bd');
  if (r === 'agency') push('agency');
  if (r === 'creator' || r === 'host') push('host');
  if (r === 'coin_seller' || r === 'seller' || user?.is_coin_seller) push('seller');
  if (r === 'worker') push('pro');
  return keys;
}

export const ROLE_BADGE = {
  admin: { label: 'ADMIN', bg: ['#fde68a', '#f59e0b'], color: '#1c1917' },
  bd: { label: 'BD', bg: ['#bfdbfe', '#60a5fa'], color: '#1e3a8a' },
  agency: { label: 'Agency', bg: ['#fde68a', '#fbbf24'], color: '#713f12' },
  host: { label: 'Host', bg: ['#bbf7d0', '#4ade80'], color: '#14532d' },
  seller: { label: 'Coin Seller', bg: ['#fed7aa', '#fb923c'], color: '#9a3412' },
  pro: { label: 'Professional', bg: ['#dbeafe', '#93c5fd'], color: '#1e3a8a' },
};
