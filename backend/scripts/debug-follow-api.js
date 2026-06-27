#!/usr/bin/env node
/**
 * Debug follow/unfollow against live API.
 * Usage: node scripts/debug-follow-api.js <email> <password> [targetUserId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API = (process.env.DEBUG_API_URL || 'https://api.apservices.in/api').replace(/\/+$/, '');

async function req(method, path, token, body) {
  const url = `${API}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, url };
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  let targetId = process.argv[4];

  if (!email || !password) {
    console.error('Usage: node scripts/debug-follow-api.js <email> <password> [targetUserId]');
    process.exit(1);
  }

  console.log('API:', API);

  const login = await req('POST', '/auth/login', null, { email, password });
  console.log('\n[login]', login.status, JSON.stringify(login.data));
  if (login.status !== 200 || !login.data?.data?.accessToken) {
    process.exit(1);
  }
  const token = login.data.data.accessToken;
  const me = login.data.data.user?.id;
  console.log('Logged in as:', me);

  const stats = await req('GET', `/social/stats/${me}`, token);
  console.log('\n[stats before]', stats.status, JSON.stringify(stats.data));

  const following = await req('GET', '/social/following?limit=5', token);
  console.log('\n[following]', following.status, JSON.stringify(following.data));

  if (!targetId) {
    const disc = await req('GET', '/social/discover/creators?period=weekly&limit=5', token);
    console.log('\n[discover]', disc.status);
    const creators = disc.data?.data?.creators || [];
    targetId = creators.find((c) => String(c.id) !== String(me))?.id;
    console.log('Picked target:', targetId, creators[0]?.displayName);
  }

  if (!targetId) {
    console.error('No target user id');
    process.exit(1);
  }

  const status0 = await req('GET', `/social/follow/${targetId}/status`, token);
  console.log('\n[status before]', status0.status, JSON.stringify(status0.data));

  const follow = await req('POST', `/social/follow/${targetId}`, token, {});
  console.log('\n[follow POST]', follow.status, JSON.stringify(follow.data));

  const status1 = await req('GET', `/social/follow/${targetId}/status`, token);
  console.log('[status after follow]', status1.status, JSON.stringify(status1.data));

  const unfollow = await req('DELETE', `/social/follow/${targetId}`, token);
  console.log('\n[unfollow DELETE]', unfollow.status, JSON.stringify(unfollow.data));

  const status2 = await req('GET', `/social/follow/${targetId}/status`, token);
  console.log('[status after unfollow]', status2.status, JSON.stringify(status2.data));

  const stats2 = await req('GET', `/social/stats/${me}`, token);
  console.log('\n[stats after]', stats2.status, JSON.stringify(stats2.data));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
