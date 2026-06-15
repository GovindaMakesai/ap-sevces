# Complete guide: get `api.yourdomain.com` + HTTPS on your VPS

This guide assumes your VPS IP is **62.72.56.74** (Hostinger).  
End result: **`https://api.apservices.in`** (or whatever domain you pick) — API, website, login, live sockets, all on your backend. No Vercel needed.

---

## Part A — Buy a domain (first time only)

### A1. Log into Hostinger

1. Open [https://www.hostinger.com](https://www.hostinger.com)
2. Click **Log in** (top right)
3. Use the same account where your VPS lives

### A2. Search and buy a domain

1. In the dashboard, click **Domains** (left menu) or **Get a new domain**
2. Type a name, for example:
   - `apservices.in`
   - `apservices.com`
   - `apmarket.in`
3. Pick one that is **available** and affordable (`.in` is often cheaper in India)
4. Add to cart → pay → wait until status shows **Active**

**You now own something like `apservices.in`.**  
You do **not** need to buy `api.apservices.in` separately — `api` is free; you add it in DNS next.

---

## Part B — Create the `api` subdomain (DNS)

This tells the internet: **`api.yourdomain.com` → your VPS**.

### B1. Open DNS settings

1. Hostinger dashboard → **Domains**
2. Click your domain (e.g. `apservices.in`)
3. Click **DNS / DNS Zone / Manage DNS** (wording varies slightly)

### B2. Add an A record

Click **Add record** (or **Add new record**) and fill in:

| Field | Value |
|-------|--------|
| **Type** | `A` |
| **Name** / **Host** / **Subdomain** | `api` |
| **Points to** / **Value** / **IP** | `62.72.56.74` |
| **TTL** | `3600` or leave default |

Click **Save** / **Add record**.

**What you created:** `api.apservices.in` → `62.72.56.74`

### B3. Remove conflicts (if any)

If you see another record for `api` (CNAME, old A record), delete the old one.  
Only **one** `api` record should point to `62.72.56.74`.

### B4. Wait for DNS to propagate

Usually **5–30 minutes**. Sometimes up to 2 hours.

**Test on your Windows PC (PowerShell):**

```powershell
ping api.apservices.in
```

Replace `apservices.in` with **your** domain.

✅ Good: replies from `62.72.56.74`  
❌ Bad: "could not find host" → wait longer or check the A record spelling

**Alternative test:**

```powershell
nslookup api.apservices.in
```

Should show `Address: 62.72.56.74`.

**Do not run the VPS script until ping/nslookup shows your VPS IP.**

---

## Part C — Push code to GitHub (on your PC)

The HTTPS script lives in this repo. Make sure VPS can `git pull` it.

```powershell
cd C:\Users\Reyan\OneDrive\Desktop\ap-services-marketplace-main
git add deploy/hostinger/ config/domain.js frontend/ap-config.js
git status
git commit -m "Add VPS HTTPS setup guide and config"
git push origin main
```

(Ask Cursor to commit/push if you prefer.)

---

## Part D — Run HTTPS setup on the VPS

### D1. Connect by SSH

**Option 1 — Hostinger browser terminal**

1. Hostinger → **VPS** → your server
2. Click **Browser terminal** or **SSH access**

**Option 2 — Windows PowerShell**

```powershell
ssh root@62.72.56.74
```

Use the root password from Hostinger VPS panel (or your SSH key).

### D2. Pull latest code

```bash
cd /var/www/ap-services
git pull origin main
```

If the folder does not exist, clone first:

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USER/ap-services-marketplace-main.git ap-services
cd ap-services
```

### D3. Run the setup script

Replace with **your real subdomain** and **your email**:

```bash
bash deploy/hostinger/setup-https.sh api.apservices.in you@gmail.com
```

Example if your domain is `apmarket.in`:

```bash
bash deploy/hostinger/setup-https.sh api.apmarket.in you@gmail.com
```

The script will:

1. Install **nginx** and **certbot**
2. Get a free **SSL certificate** (Let's Encrypt)
3. Configure nginx: `/api`, `/auth`, `/socket.io` → Node on port 5000
4. Serve your **frontend** files over HTTPS
5. Update `backend/.env` OAuth URLs to your HTTPS domain
6. Restart **pm2** (`ap-api`)

### D4. If something fails

```bash
# Is the API running?
pm2 status
pm2 logs ap-api --lines 50

# Is nginx OK?
nginx -t
systemctl status nginx

# Local health (on VPS)
curl http://127.0.0.1:5000/api/health
```

Common issues:

| Problem | Fix |
|---------|-----|
| certbot fails | DNS not ready — wait, run `ping api.yourdomain.com` from PC again |
| port 80 blocked | Hostinger firewall: allow HTTP 80 and HTTPS 443 |
| git pull fails | Set up deploy key or clone with HTTPS token |

---

## Part E — Update Google / GitHub / Facebook login

After HTTPS works, add these **exact** callback URLs in each provider console.

Replace `api.apservices.in` with your subdomain:

```
https://api.apservices.in/auth/google/callback
https://api.apservices.in/auth/github/callback
https://api.apservices.in/auth/facebook/callback
```

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) → your project
2. **APIs & Services** → **Credentials**
3. Open your **OAuth 2.0 Client ID**
4. **Authorized redirect URIs** → Add the Google URL above → Save

### GitHub

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps**
2. Your app → **Authorization callback URL** → paste GitHub URL → Update

### Facebook

1. [Meta for Developers](https://developers.facebook.com/) → your app
2. **Facebook Login** → **Settings**
3. **Valid OAuth Redirect URIs** → add Facebook URL → Save

You can remove old `vercel.app` and `onrender.com` URLs later once login works on the new domain.

---

## Part F — Switch the app to use your HTTPS domain (PC)

Edit these 3 files (use **your** URL everywhere):

### 1. `config/domain.js`

```js
PUBLIC_HTTPS_URL: 'https://api.apservices.in',
USE_HTTPS_DOMAIN: true,
```

### 2. `frontend/ap-config.js`

```js
var USE_HTTPS = true;
var PUBLIC_HTTPS_URL = 'https://api.apservices.in';
```

### 3. `ap-services-app/config/production-api.js`

Same `USE_HTTPS_DOMAIN: true` and `PUBLIC_HTTPS_URL`.

Then:

```powershell
git add config/domain.js frontend/ap-config.js ap-services-app/config/production-api.js
git commit -m "Enable HTTPS domain for production"
git push origin main
```

On VPS after push (optional — script already updated `.env`):

```bash
cd /var/www/ap-services && git pull && pm2 restart ap-api
```

---

## Part G — Test everything

Open in browser:

| URL | Expected |
|-----|----------|
| `https://api.apservices.in/api/health` | JSON like `{"status":"ok"}` |
| `https://api.apservices.in/app-auth.html` | Login page |
| Google login | Redirects to Google, comes back to **your domain**, logged in |

---

## Quick checklist

- [ ] Domain bought and **Active** in Hostinger
- [ ] DNS A record: `api` → `62.72.56.74`
- [ ] `ping api.yourdomain.com` shows VPS IP
- [ ] Code pushed to GitHub
- [ ] `setup-https.sh` ran successfully on VPS
- [ ] OAuth callbacks updated in Google/GitHub/Facebook
- [ ] `USE_HTTPS_DOMAIN = true` in config files
- [ ] Login works on `https://api.yourdomain.com`

---

## FAQ

**Do I need Vercel after this?**  
No. Your VPS serves UI + API + OAuth over HTTPS.

**Can I use the root domain (`apservices.in`) instead of `api`?**  
Yes. Use `@` as the DNS name (or leave Name blank) pointing to `62.72.56.74`, then run:
`bash deploy/hostinger/setup-https.sh apservices.in your@email.com`

**What if I don't want to buy a domain yet?**  
Keep using Vercel for HTTPS OAuth temporarily. Google/Facebook require HTTPS — raw `http://62.72.56.74:5000` will not work for login.

**How much does it cost?**  
Domain ~₹500–1500/year. SSL (Let's Encrypt) is free. VPS you already pay for.

---

## Your VPS details (reference)

| Item | Value |
|------|--------|
| VPS IP | `62.72.56.74` |
| App path | `/var/www/ap-services` |
| PM2 name | `ap-api` |
| Backend port | `5000` (nginx proxies 443 → 5000) |
