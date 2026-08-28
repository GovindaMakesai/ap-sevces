/** Production backend — same host as the existing AP Services API. */
export const USE_HTTPS_DOMAIN = true;
export const PUBLIC_HTTPS_URL = 'https://api.apservices.in';
export const VPS_HTTP = 'http://62.72.56.74:5000';

export const BACKEND_URL = USE_HTTPS_DOMAIN ? PUBLIC_HTTPS_URL : VPS_HTTP;
export const API_URL = `${BACKEND_URL.replace(/\/$/, '')}/api`;
export const SOCKET_URL = BACKEND_URL.replace(/\/$/, '');

export const OAUTH_RETURN_PATH = 'oauth-complete';
export const APP_SCHEME = 'apservices';

export const APP_NAME = 'AP Live Service';

export function oauthStartUrl(provider, returnUrl, role = 'customer') {
  return (
    `${BACKEND_URL}/auth/${provider}` +
    `?role=${encodeURIComponent(role)}` +
    `&app_redirect=${encodeURIComponent(returnUrl)}`
  );
}

export function mediaUrl(path) {
  if (!path) return null;
  const p = String(path).trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p) || p.startsWith('data:') || p.startsWith('blob:')) return p;
  if (p.startsWith('//')) return `https:${p}`;
  const base = BACKEND_URL.replace(/\/$/, '');
  return `${base}${p.startsWith('/') ? '' : '/'}${p}`;
}
