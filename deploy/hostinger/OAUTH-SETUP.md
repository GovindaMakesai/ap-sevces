# OAuth setup — AP Services (Vercel + VPS)

Backend API: `http://62.72.56.74:5000`  
UI + OAuth HTTPS: `https://ap-sevces.vercel.app`

## Callback URLs (register in ALL three consoles)

| Provider | URL |
|----------|-----|
| Google | `https://ap-sevces.vercel.app/auth/google/callback` |
| GitHub | `https://ap-sevces.vercel.app/auth/github/callback` |
| Facebook | `https://ap-sevces.vercel.app/auth/facebook/callback` |

Remove any `https://ap-sevces.onrender.com/auth/...` entries.

---

## 1. Google Cloud Console

1. https://console.cloud.google.com/ → your project  
2. **APIs & Services** → **Credentials**  
3. Open **OAuth 2.0 Client ID** (Web application)  
4. **Authorized redirect URIs** → add:
   ```
   https://ap-sevces.vercel.app/auth/google/callback
   ```
5. Save  

Copy **Client ID** and **Client secret** → VPS `backend/.env`:
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## 2. GitHub

1. https://github.com/settings/developers → **OAuth Apps**  
2. Your app → **Authorization callback URL**:
   ```
   https://ap-sevces.vercel.app/auth/github/callback
   ```
3. Update application  

Copy **Client ID** and **Client secret** → VPS `.env`:
```env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

---

## 3. Facebook (Meta)

1. https://developers.facebook.com/ → your app  
2. **Facebook Login** → **Settings**  
3. **Valid OAuth Redirect URIs** → add:
   ```
   https://ap-sevces.vercel.app/auth/facebook/callback
   ```
4. Save  

Copy **App ID** and **App secret** → VPS `.env`:
```env
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
```

---

## 4. VPS server (`backend/.env`)

SSH:
```bash
ssh root@62.72.56.74
cd /var/www/ap-services
```

Option A — edit manually:
```bash
nano backend/.env
```
Paste values from `deploy/hostinger/vps.env.template` and fill secrets.

Option B — auto-set callback URL lines (keeps your existing secrets):
```bash
bash deploy/hostinger/apply-oauth-env.sh
```

Restart:
```bash
pm2 restart ap-api
pm2 logs ap-api --lines 20
```
Look for: `[auth] OAuth callbacks: { google: 'https://ap-sevces.vercel.app/...`

---

## 5. Deploy code (PC)

Push so Vercel + VPS get latest `vercel.json` and auth fixes:
```powershell
git add -A
git commit -m "OAuth: Vercel callbacks + VPS backend"
git push origin main
```

Vercel redeploys automatically. VPS: GitHub Action or `git pull && pm2 restart ap-api`.

---

## 6. Test

1. Browser: https://ap-sevces.vercel.app/api/health → should return JSON (proves Vercel → VPS)  
2. https://ap-sevces.vercel.app/app-auth.html → **Continue with Google**  
3. Expo app → same login flow → should return to app with token  

### Errors

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Google URI must match exactly (no trailing slash typo) |
| 503 OAuth not configured | Missing `GOOGLE_CLIENT_ID` / secret on VPS `.env` |
| Stuck on Vercel after login | Push latest `login-success.html` + restart app |

---

## Print URLs from repo (local)

```bash
node scripts/print-oauth-urls.js
```
