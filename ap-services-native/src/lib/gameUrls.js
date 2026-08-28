import { BACKEND_URL } from '../config/api';

/** Games are served from the same host as the API (webview uses relative /games/*). */
export const WEB_BASE = BACKEND_URL.replace(/\/$/, '');

const GAME_PATHS = {
  'crazy-fruit': '/games/crazy-fruit.html',
  greedy: '/games/greedy.html',
  'teen-patti': '/games/teen-patti.html',
  roulette: '/games/roulette.html',
  'food-roulette': '/games/food-roulette.html',
  'card-war': '/games/card-war.html',
};

export function gamePageUrl(slug, extraQuery = '') {
  const key = String(slug || 'greedy').toLowerCase();
  const path = GAME_PATHS[key] || GAME_PATHS.greedy;
  const q = extraQuery ? (extraQuery.startsWith('?') ? extraQuery : `?${extraQuery}`) : '';
  return `${WEB_BASE}${path}${q}`;
}

export const GAME_URLS = {
  'crazy-fruit': gamePageUrl('crazy-fruit'),
  greedy: gamePageUrl('greedy'),
  'teen-patti': gamePageUrl('teen-patti'),
};

/** Block parked-domain / Hostinger URLs; always prefer API-hosted game pages. */
export function normalizeGameUrl(url, slug = 'greedy') {
  const u = String(url || '').trim();
  if (!u || /hostinger|parked-domain|domain.*for sale/i.test(u)) {
    return gamePageUrl(slug, 'app=1&native=1');
  }
  if (/^https?:\/\/apservices\.in/i.test(u) && !/api\.apservices\.in/i.test(u)) {
    return gamePageUrl(slug, 'app=1&native=1');
  }
  return u;
}
