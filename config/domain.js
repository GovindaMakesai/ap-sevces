/**
 * Public HTTPS URL — set after domain + SSL on VPS.
 * 1. Buy domain, point A record → 62.72.56.74
 * 2. Run: bash deploy/hostinger/setup-https.sh api.yourdomain.com
 * 3. Set PUBLIC_HTTPS_URL below and USE_HTTPS_DOMAIN = true
 * 4. Push + redeploy app
 */
module.exports = {
  /** e.g. 'https://api.apservices.in' — no trailing slash */
  PUBLIC_HTTPS_URL: 'https://api.apservices.in',

  /** Flip to true after certbot succeeds on VPS */
  USE_HTTPS_DOMAIN: false,

  VPS_HTTP: 'http://62.72.56.74:5000',
  VERCEL_UI: 'https://ap-sevces.vercel.app',

  get BACKEND_URL() {
    return this.USE_HTTPS_DOMAIN ? this.PUBLIC_HTTPS_URL : this.VPS_HTTP;
  },

  get FRONTEND_URL() {
    return this.USE_HTTPS_DOMAIN ? this.PUBLIC_HTTPS_URL : this.VERCEL_UI;
  },

  get OAUTH_CALLBACK_BASE() {
    return this.USE_HTTPS_DOMAIN ? this.PUBLIC_HTTPS_URL : this.VERCEL_UI;
  },
};
