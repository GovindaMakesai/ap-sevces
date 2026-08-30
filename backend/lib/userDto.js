/**
 * Response serializers — only expose fields appropriate for each audience.
 */
const { formatDisplayId } = require('./displayId');
const { sanitizePublicText } = require('./safeText');
const { displayPhone } = require('./userPhone');
const { PLATFORM_OWNER_EMAIL } = require('../middleware/platformOwner');

function publicUser(user, { self = false } = {}) {
  if (!user) return null;
  const displayId = formatDisplayId(user.display_id);
  const firstName = sanitizePublicText(user.first_name, 80);
  const lastName = sanitizePublicText(user.last_name, 80);
  const role = String(user.role || '').toLowerCase();
  const roles = Array.isArray(user.roles)
    ? user.roles.map((s) => String(s || '').toLowerCase()).filter(Boolean)
    : [role].filter(Boolean);
  const email = String(user.email || '').trim().toLowerCase();
  const isOwner = Boolean(email) && email === PLATFORM_OWNER_EMAIL;
  const isAdmin =
    isOwner ||
    ['admin', 'super_admin', 'founder', 'ceo'].includes(role) ||
    roles.some((s) => ['admin', 'super_admin', 'founder', 'ceo'].includes(s));
  const isSuperAdmin =
    isOwner ||
    ['super_admin', 'founder', 'ceo'].includes(role) ||
    roles.some((s) => ['super_admin', 'founder', 'ceo'].includes(s));
  const isAgency = Boolean(user.is_agency) || role === 'agency' || roles.includes('agency');
  const isCoinSeller = Boolean(user.is_coin_seller) || role === 'coin_seller' || roles.includes('coin_seller');
  const base = {
    first_name: firstName,
    last_name: lastName,
    profile_pic: user.profile_pic || null,
    is_verified: Boolean(user.is_verified),
    display_id: displayId,
    is_admin: isAdmin,
    is_super_admin: isSuperAdmin,
    bio: user.bio || null,
    social_links: user.social_links || {},
  };
  if (self) {
    return {
      ...base,
      id: user.id,
      email: user.email,
      phone: displayPhone(user),
      role: isOwner && !['super_admin', 'founder', 'ceo'].includes(role) ? 'super_admin' : user.role,
      roles: isOwner && !roles.includes('super_admin') ? [...roles, 'super_admin'] : roles,
      is_agency: isAgency,
      is_coin_seller: isCoinSeller,
      gender: user.gender || null,
      created_at: user.created_at,
      updated_at: user.updated_at || null,
      admin_caps: Array.isArray(user.admin_caps) ? user.admin_caps : null,
    };
  }
  return {
    ...base,
    id: user.id,
    display_name: sanitizePublicText(`${firstName} ${lastName}`.trim(), 48) || 'User',
  };
}

function publicWorker(row) {
  if (!row) return null;
  return {
    id: row.id,
    bio: row.bio,
    experience_years: row.experience_years,
    hourly_rate: row.hourly_rate,
    category: row.category,
    rating: row.rating,
    total_reviews: row.total_reviews,
    is_available: row.is_available,
    profile_photo_url: row.profile_photo_url || row.profile_pic,
    first_name: sanitizePublicText(row.first_name, 80),
    last_name: sanitizePublicText(row.last_name, 80),
    display_name: sanitizePublicText(`${row.first_name || ''} ${row.last_name || ''}`.trim(), 48) || 'Professional',
  };
}

function publicLiveRoom(row) {
  if (!row) return null;
  return {
    channel: row.channel,
    type: row.room_type,
    hostId: row.host_user_id,
    hostName: sanitizePublicText(row.host_display_name, 48) || 'Live',
    hostDisplayId: row.host_display_id != null ? String(row.host_display_id) : null,
    hostProfilePic: row.host_profile_pic || null,
    hostStreamCover: row.stream_cover_url || row.hostStreamCover || null,
    hostUpdatedAt: row.host_updated_at || null,
    viewers: row.viewer_count || 0,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    previewPics: Array.isArray(row.preview_pics)
      ? row.preview_pics.filter(Boolean).slice(0, 4)
      : [],
  };
}

module.exports = { publicUser, publicWorker, publicLiveRoom };
