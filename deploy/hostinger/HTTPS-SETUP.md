# HTTPS on VPS — one domain for API + UI + OAuth

## 1. Buy domain & DNS

At Hostinger (or any registrar), add:

| Type | Name | Points to |
|------|------|-----------|
| A | `api` | `62.72.56.74` |

Wait 5–30 minutes. Test: `ping api.yourdomain.com`

## 2. Run on VPS (SSH)

```bash
ssh root@62.72.56.74
cd /var/www/ap-services
git pull origin main
bash deploy/hostinger/setup-https.sh api.yourdomain.com
```

Replace `api.yourdomain.com` with your real subdomain.

## 3. Google / GitHub / Facebook

Add callback URLs (exact):

```
https://api.yourdomain.com/auth/google/callback
https://api.yourdomain.com/auth/github/callback
https://api.yourdomain.com/auth/facebook/callback
```

Remove old `onrender.com` and `vercel.app` URLs when ready.

## 4. Update app config (on your PC)

Edit **`config/domain.js`**:
```js
PUBLIC_HTTPS_URL: 'https://api.yourdomain.com',
USE_HTTPS_DOMAIN: true,
```

Edit **`frontend/ap-config.js`** — set `USE_HTTPS = true` and same URL.

Edit **`ap-services-app/config/production-api.js`** — same.

Push to GitHub. Rebuild mobile app if needed.

## 5. Test

```
https://api.yourdomain.com/api/health
https://api.yourdomain.com/app-auth.html
```

Google login → stays on **your domain** → no Vercel needed.

## Optional

- Point mobile WebView to `https://api.yourdomain.com` instead of Vercel
- Stop using Vercel entirely once UI is served from VPS nginx
