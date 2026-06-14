/**
 * Production API — uses config/domain.js (HTTPS domain when enabled).
 */
const domain = require('./domain');

const BACKEND_URL = domain.BACKEND_URL;
const FRONTEND_URL = domain.FRONTEND_URL;
const OAUTH_CALLBACK_BASE = domain.OAUTH_CALLBACK_BASE;

module.exports = {
  BACKEND_URL,
  FRONTEND_URL,
  OAUTH_CALLBACK_BASE,
  USE_HTTPS_DOMAIN: domain.USE_HTTPS_DOMAIN,
  PUBLIC_HTTPS_URL: domain.PUBLIC_HTTPS_URL,
  OAUTH_CALLBACKS: {
    google: `${OAUTH_CALLBACK_BASE}/auth/google/callback`,
    github: `${OAUTH_CALLBACK_BASE}/auth/github/callback`,
    facebook: `${OAUTH_CALLBACK_BASE}/auth/facebook/callback`,
  },
  get API_URL() {
    return `${BACKEND_URL.replace(/\/$/, '')}/api`;
  },
};
