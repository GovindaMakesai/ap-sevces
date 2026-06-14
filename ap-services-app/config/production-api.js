/** Keep in sync with config/domain.js (Metro cannot import repo root). */
const USE_HTTPS_DOMAIN = false;
const PUBLIC_HTTPS_URL = 'https://api.apservices.in';
const VPS_HTTP = 'http://62.72.56.74:5000';
const VERCEL_UI = 'https://ap-sevces.vercel.app';

const BACKEND_URL = USE_HTTPS_DOMAIN ? PUBLIC_HTTPS_URL : VPS_HTTP;
const FRONTEND_URL = USE_HTTPS_DOMAIN ? PUBLIC_HTTPS_URL : VERCEL_UI;
const OAUTH_CALLBACK_BASE = USE_HTTPS_DOMAIN ? PUBLIC_HTTPS_URL : VERCEL_UI;

module.exports = {
  BACKEND_URL,
  FRONTEND_URL,
  OAUTH_CALLBACK_BASE,
  USE_HTTPS_DOMAIN,
  OAUTH_CALLBACKS: {
    google: `${OAUTH_CALLBACK_BASE}/auth/google/callback`,
    github: `${OAUTH_CALLBACK_BASE}/auth/github/callback`,
    facebook: `${OAUTH_CALLBACK_BASE}/auth/facebook/callback`,
  },
  get API_URL() {
    return `${BACKEND_URL.replace(/\/$/, '')}/api`;
  },
};
