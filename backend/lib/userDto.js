/**
 * Response serializers — only expose fields appropriate for each audience.
 */
const { formatDisplayId } = require('./displayId');

function publicUser(user, { self = false } = {}) {
  if (!user) return null;
  const displayId = formatDisplayId(user.display_id);
  const role = String(user.role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'founder', 'ceo'].includes(role);
  const base = {
    first_name: user.first_name,
    last_name: user.last_name,
    profile_pic: user.profile_pic || null,
    is_verified: Boolean(user.is_verified),
    display_id: displayId,
    is_admin: isAdmin,
  };
  if (self) {
    return {
      ...base,
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      gender: user.gender || null,
      created_at: user.created_at,
      updated_at: user.updated_at || null,
    };
  }
  return {
    ...base,
    id: user.id,
    display_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User',
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
    first_name: row.first_name,
    last_name: row.last_name,
    display_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Professional',
  };
}

function publicLiveRoom(row) {
  if (!row) return null;
  return {
    channel: row.channel,
    type: row.room_type,
    hostId: row.host_user_id,
    hostName: row.host_display_name,
    hostDisplayId: row.host_display_id != null ? String(row.host_display_id) : null,
    hostProfilePic: row.host_profile_pic || null,
    hostUpdatedAt: row.host_updated_at || null,
    viewers: row.viewer_count || 0,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
  };
}

module.exports = { publicUser, publicWorker, publicLiveRoom };
