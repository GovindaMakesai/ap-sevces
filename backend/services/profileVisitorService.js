const db = require('../config/database');
const svipService = require('./svipService');
const followService = require('./followService');

const VISITORS_MIN_SVIP = 1;
const ANON_MIN_SVIP = 5;

async function visitorIsAnonymous(visitorUserId) {
  const home = await svipService.getSvipHome(visitorUserId);
  if ((home.level || 0) < ANON_MIN_SVIP) return false;
  return Boolean(home.settings?.anon_visitor);
}

async function canViewVisitors(userId) {
  const home = await svipService.getSvipHome(userId);
  return (home.level || 0) >= VISITORS_MIN_SVIP;
}

async function recordVisit(visitorUserId, profileUserId) {
  const visitor = String(visitorUserId || '');
  const profile = String(profileUserId || '');
  if (!visitor || !profile || visitor === profile) {
    return { recorded: false, reason: 'skip_self' };
  }

  if (await followService.areBlockedEitherWay(visitor, profile)) {
    return { recorded: false, reason: 'blocked' };
  }

  const isAnonymous = await visitorIsAnonymous(visitor);

  await db.query(
    `INSERT INTO profile_visits (profile_user_id, visitor_user_id, visited_at, visit_count, is_anonymous)
     VALUES ($1, $2, CURRENT_TIMESTAMP, 1, $3)
     ON CONFLICT (profile_user_id, visitor_user_id)
     DO UPDATE SET
       visited_at = CURRENT_TIMESTAMP,
       visit_count = profile_visits.visit_count + 1,
       is_anonymous = EXCLUDED.is_anonymous`,
    [profile, visitor, isAnonymous]
  );

  return { recorded: true, isAnonymous };
}

function mapVisitorRow(r, { hideIdentity = false } = {}) {
  const anonymous = hideIdentity || Boolean(r.is_anonymous);
  const name = anonymous
    ? 'Anonymous visitor'
    : `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'User';
  return {
    userId: anonymous ? null : String(r.user_id),
    name,
    profilePic: anonymous ? null : r.profile_pic || null,
    displayId: anonymous ? null : r.display_id || null,
    gender: anonymous ? null : r.gender || null,
    visitedAt: r.visited_at,
    visitCount: Number(r.visit_count || 1),
    isAnonymous: anonymous,
  };
}

async function getSummary(profileUserId) {
  const home = await svipService.getSvipHome(profileUserId);
  const level = home.level || 0;
  const canView = level >= VISITORS_MIN_SVIP;
  const res = await db.query(
    `SELECT
       COUNT(*)::int AS total_visitors,
       COALESCE(SUM(visit_count), 0)::int AS total_visits,
       COUNT(*) FILTER (WHERE visited_at >= NOW() - INTERVAL '7 days')::int AS week_visitors
     FROM profile_visits
     WHERE profile_user_id = $1`,
    [profileUserId]
  );
  const row = res.rows[0] || {};
  return {
    canView,
    svipLevel: level,
    svipRequired: VISITORS_MIN_SVIP,
    canAnon: level >= ANON_MIN_SVIP,
    anonMinSvip: ANON_MIN_SVIP,
    anonEnabled: Boolean(home.settings?.anon_visitor),
    totalVisitors: Number(row.total_visitors || 0),
    totalVisits: Number(row.total_visits || 0),
    weekVisitors: Number(row.week_visitors || 0),
  };
}

async function listVisitors(profileUserId, { limit = 50, offset = 0 } = {}) {
  const canView = await canViewVisitors(profileUserId);
  if (!canView) {
    return {
      canView: false,
      svipRequired: VISITORS_MIN_SVIP,
      visitors: [],
      total: 0,
    };
  }

  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM profile_visits WHERE profile_user_id = $1`,
    [profileUserId]
  );
  const total = Number(countRes.rows[0]?.c || 0);

  const res = await db.query(
    `SELECT pv.visited_at, pv.visit_count, pv.is_anonymous,
            u.id AS user_id, u.first_name, u.last_name, u.profile_pic, u.display_id, u.gender
     FROM profile_visits pv
     JOIN users u ON u.id = pv.visitor_user_id AND u.is_active = TRUE
     WHERE pv.profile_user_id = $1
     ORDER BY pv.visited_at DESC
     LIMIT $2 OFFSET $3`,
    [profileUserId, lim, off]
  );

  const visitors = res.rows.map((r) => mapVisitorRow(r));

  return { canView: true, svipRequired: VISITORS_MIN_SVIP, visitors, total };
}

async function listVisitedByMe(visitorUserId, { limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM profile_visits WHERE visitor_user_id = $1`,
    [visitorUserId]
  );
  const total = Number(countRes.rows[0]?.c || 0);

  const res = await db.query(
    `SELECT pv.visited_at, pv.visit_count, pv.is_anonymous,
            u.id AS user_id, u.first_name, u.last_name, u.profile_pic, u.display_id, u.gender
     FROM profile_visits pv
     JOIN users u ON u.id = pv.profile_user_id AND u.is_active = TRUE
     WHERE pv.visitor_user_id = $1
     ORDER BY pv.visited_at DESC
     LIMIT $2 OFFSET $3`,
    [visitorUserId, lim, off]
  );

  const visited = res.rows.map((r) => mapVisitorRow(r));

  return { visited, total };
}

module.exports = {
  VISITORS_MIN_SVIP,
  ANON_MIN_SVIP,
  recordVisit,
  getSummary,
  listVisitors,
  listVisitedByMe,
  canViewVisitors,
};
