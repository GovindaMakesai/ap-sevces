/**
 * Production endpoints — Hostinger VPS backend.
 * Change BACKEND_URL here only; sync frontend/ap-config.js + ap-services-app/config/production-api.js
 */
const BACKEND_URL = 'http://62.72.56.74:5000';
const FRONTEND_URL = 'https://ap-sevces.vercel.app';

/** OAuth redirect URIs (HTTPS). Google/GitHub/Facebook must list these exactly. */
const OAUTH_CALLBACK_BASE = FRONTEND_URL;

module.exports = {
  BACKEND_URL,
  FRONTEND_URL,
  OAUTH_CALLBACK_BASE,
  OAUTH_CALLBACKS: {
    google: `${OAUTH_CALLBACK_BASE}/auth/google/callback`,
    github: `${OAUTH_CALLBACK_BASE}/auth/github/callback`,
    facebook: `${OAUTH_CALLBACK_BASE}/auth/facebook/callback`,
  },
  get API_URL() {
    return `${BACKEND_URL.replace(/\/$/, '')}/api`;
  },
};
