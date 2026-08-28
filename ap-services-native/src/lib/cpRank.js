import { mediaUrl } from '../config/api';

/** Normalize CP rankings period for API (week | total). */
export function cpRankPeriod(period) {
  const p = String(period || '').toLowerCase();
  if (p === 'total' || p === 'all' || p === 'monthly') return 'total';
  return 'week';
}

/** Map API couple ranking row → UI row. */
export function mapCpRankRow(item, i = 0) {
  if (!item || typeof item !== 'object') {
    return {
      rank: i + 1,
      userId: '',
      partnerId: '',
      name: 'Couple',
      nameA: 'User',
      nameB: 'User',
      pic: null,
      partnerPic: null,
      score: 0,
      ringId: null,
    };
  }
  const a = item.userA || item.user_a || {};
  const b = item.userB || item.user_b || {};
  const nameA = a.name || item.userName || 'User';
  const nameB = b.name || item.partnerName || 'User';
  return {
    rank: Number(item.rank || i + 1),
    userId: String(a.userId || a.id || item.userId || ''),
    partnerId: String(b.userId || b.id || item.partnerId || ''),
    name: `${nameA} ♥ ${nameB}`,
    nameA,
    nameB,
    pic: mediaUrl(a.profilePic || a.profile_pic || item.profilePic || item.profile_pic),
    partnerPic: mediaUrl(b.profilePic || b.profile_pic || item.partnerPic || item.partner_pic),
    score: Number(item.intimacy ?? item.score ?? 0),
    ringId: item.ringId || item.ring_id || null,
  };
}

/** Pull rankings array from /cp/rankings response. */
export function extractCpRankings(api, response) {
  const data = api?.unwrap ? api.unwrap(response) : response?.data || response || {};
  if (Array.isArray(data?.rankings)) return data.rankings;
  if (Array.isArray(response?.data?.rankings)) return response.data.rankings;
  if (Array.isArray(data)) return data;
  const list = api?.extractList?.(response);
  return Array.isArray(list) ? list : [];
}
