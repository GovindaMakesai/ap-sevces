/** Normalize GET /cp/home so screens read partnerName / partnerPic from data.cp. */
export function parseCpBond(home) {
  const data = home && typeof home === 'object' ? home : {};
  const raw = data.cp && typeof data.cp === 'object' && !Array.isArray(data.cp) ? data.cp : data;
  const nested = raw.partner && typeof raw.partner === 'object' ? raw.partner : null;
  const partnerId = String(
    raw.partnerId || raw.partner_id || nested?.id || nested?.userId || nested?.partnerId || ''
  ).trim();
  const partnerName = String(
    raw.partnerName
      || raw.partner_name
      || nested?.name
      || nested?.displayName
      || [nested?.first_name, nested?.last_name].filter(Boolean).join(' ')
      || ''
  ).trim();
  const partnerPic = raw.partnerPic || raw.partner_pic || nested?.profilePic || nested?.profile_pic || nested?.avatar || null;
  const hasCp = Boolean(partnerId || (partnerName && partnerName.toLowerCase() !== 'add'));
  const ring = raw.ring && typeof raw.ring === 'object' ? raw.ring : null;
  return {
    hasCp,
    partnerId: partnerId || null,
    partnerName: partnerName || (hasCp ? 'Partner' : ''),
    partnerPic,
    ringId: raw.ringId || raw.ring_id || ring?.id || null,
    ring,
    days: Number(raw.daysTogether || raw.togetherDays || raw.days || 0) || 0,
    level: Number(raw.cpLevel || raw.level || data.cpLevel || 1) || 1,
    intimacy: Number(raw.intimacyValue || raw.intimacy || 0) || 0,
    ownedRings: Array.isArray(data.ownedRings) ? data.ownedRings : [],
    pendingInvites: Array.isArray(data.pendingInvites) ? data.pendingInvites : [],
  };
}
