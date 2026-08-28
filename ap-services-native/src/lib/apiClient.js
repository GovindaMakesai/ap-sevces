import { API_URL } from '../config/api';
import { sanitizePublicText } from './safeText';
import { cacheGet, cacheSet, withInflight } from './queryCache';

let jwtCache = { token: '', usableUntil: 0 };

function isJwtUsable(token, skewSec = 30) {
  if (!token) return false;
  if (jwtCache.token === token && jwtCache.usableUntil > Date.now()) return true;
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) {
      jwtCache = { token, usableUntil: Date.now() + 60_000 };
      return true;
    }
    const ok = payload.exp > Math.floor(Date.now() / 1000) + skewSec;
    if (ok) {
      jwtCache = { token, usableUntil: (payload.exp - skewSec) * 1000 };
    }
    return ok;
  } catch (_e) {
    return false;
  }
}

export class ApiClient {
  constructor(tokenProvider, refreshHandler) {
    this.tokenProvider = tokenProvider;
    this.refreshHandler = refreshHandler;
  }

  extractList(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.data)) return response.data;
    if (response.data && typeof response.data === 'object') {
      for (const key of ['data', 'items', 'rows', 'rooms', 'conversations', 'messages', 'posts', 'gifts', 'users', 'likes', 'likers', 'comments', 'workers', 'bookings', 'services', 'applications', 'notifications', 'reviews', 'payments', 'withdrawals', 'followers', 'following', 'album', 'top', 'recent', 'packages', 'agencies', 'bds', 'codes', 'hosts', 'creators', 'transfers', 'visitors', 'children', 'tree', 'nodes', 'topAgencies', 'pending', 'rankings', 'leaderboard', 'list']) {
        if (Array.isArray(response.data[key])) return response.data[key];
      }
    }
    for (const key of ['rooms', 'items', 'rows', 'conversations', 'messages']) {
      if (Array.isArray(response[key])) return response[key];
    }
    return [];
  }

  unwrap(response) {
    if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
      return response.data;
    }
    return response || {};
  }

  async request(path, { method = 'GET', body, auth = true, headers, timeoutMs, cacheTtlMs, skipCache } = {}) {
    const isGet = String(method || 'GET').toUpperCase() === 'GET';
    const defaultTimeout = isGet ? 12000 : 30000;
    const ms = timeoutMs != null ? timeoutMs : defaultTimeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      let token = auth && this.tokenProvider ? await this.tokenProvider() : null;
      if (auth && token && !isJwtUsable(token) && this.refreshHandler) {
        token = await this.refreshHandler();
      }
      const doFetch = async (bearer) => {
        const res = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
          method,
          headers: {
            Accept: 'application/json',
            ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
            ...(headers || {}),
          },
          body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        return { res, json };
      };

      let { res, json } = await doFetch(token);
      if (auth && res.status === 401 && this.refreshHandler) {
        const nextTok = await this.refreshHandler();
        if (nextTok && nextTok !== token) {
          token = nextTok;
          ({ res, json } = await doFetch(token));
        }
      }
      if (!res.ok) {
        const err = new Error(json.message || json.error || `Request failed (${res.status})`);
        err.status = res.status;
        err.body = json;
        throw err;
      }
      if (isGet && !skipCache && cacheTtlMs !== 0) {
        cacheSet(path, null, json, cacheTtlMs != null ? cacheTtlMs : 30000);
      }
      return json;
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw new Error('Server is taking too long. Check your connection and try again.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  get(path, query, opts) {
    const qs = query
      ? `?${Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')}`
      : '';
    const fullPath = `${path}${qs}`;
    const options = { method: 'GET', ...(opts || {}) };
    const skipCache = options.skipCache === true || options.cacheTtlMs === 0;
    const ttl = options.cacheTtlMs != null ? options.cacheTtlMs : 30000;

    if (!skipCache) {
      const hit = cacheGet(fullPath, null);
      if (hit && Date.now() - hit.at < (hit.ttlMs || ttl)) {
        return Promise.resolve(hit.data);
      }
    }

    return withInflight(`GET:${fullPath}`, async () => {
      const json = await this.request(fullPath, { ...options, skipCache: true });
      if (!skipCache) cacheSet(fullPath, null, json, ttl);
      return json;
    });
  }

  post(path, body, opts) {
    return this.request(path, { method: 'POST', body, ...(opts || {}) });
  }

  put(path, body, opts) {
    return this.request(path, { method: 'PUT', body, ...(opts || {}) });
  }

  patch(path, body, opts) {
    return this.request(path, { method: 'PATCH', body, ...(opts || {}) });
  }

  delete(path, opts) {
    return this.request(path, { method: 'DELETE', ...(opts || {}) });
  }
}

export function displayName(user) {
  if (!user) return 'Guest';
  const name = [user.first_name || user.firstName, user.last_name || user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const raw = name || (user.email ? String(user.email).split('@')[0] : '') || 'User';
  return sanitizePublicText(raw, 48) || 'User';
}

export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
