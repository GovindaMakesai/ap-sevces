# Hostinger VPS deployment

Production backend: **http://62.72.56.74:5000**

Central config (update when you add domain + HTTPS):

- `config/production-api.js` — Node (dev-server, Expo app)
- `frontend/ap-config.js` — browser (keep in sync)

## Auto-deploy (GitHub Actions)

Pushes to `main` that touch `backend/`, `config/`, or `package.json` run `.github/workflows/deploy-vps.yml` and SSH to the VPS (no manual SSH needed).

### One-time setup

#### 1. GitHub repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Value |
|--------|--------|
| `VPS_HOST` | `62.72.56.74` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Private key (full contents, including `BEGIN`/`END` lines) |
| `VPS_PORT` | `22` (optional) |

#### 2. Create a deploy SSH key (on your PC)

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\ap-vps-deploy -N '""'
```

- Add **`ap-vps-deploy.pub`** to the VPS:

```bash
ssh root@62.72.56.74
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys   # paste the .pub line, save
chmod 600 ~/.ssh/authorized_keys
```

- Add **`ap-vps-deploy`** (private key file contents) to GitHub secret **`VPS_SSH_KEY`**.

Test from PC:

```powershell
ssh -i $env:USERPROFILE\.ssh\ap-vps-deploy root@62.72.56.74 "echo OK"
```

#### 3. VPS must pull from GitHub

If the repo is **private**, on the VPS generate a read-only deploy key and add the **public** key in GitHub → Repo → **Settings** → **Deploy keys**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub   # add this in GitHub Deploy keys
```

Configure git on VPS:

```bash
cd /var/www/ap-services
git remote -v   # should point to github.com/GovindaMakesai/ap-sevces.git
```

If `git pull` fails with auth, set the SSH remote:

```bash
git remote set-url origin git@github.com:GovindaMakesai/ap-sevces.git
```

Add to `~/.ssh/config` on VPS:

```
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
```

#### 4. Make deploy script executable (once)

```bash
chmod +x /var/www/ap-services/deploy/hostinger/deploy.sh
```

After secrets are set, push to `main` or run **Actions** → **Deploy backend to VPS** → **Run workflow**.

### Manual deploy (fallback)

```bash
cd /var/www/ap-services
bash deploy/hostinger/deploy.sh
```

## On the VPS (legacy manual steps)

```bash
cd /var/www/ap-services
git pull
npm install --production
pm2 restart ap-api
pm2 logs ap-api --lines 20
```

## Health checks

```bash
curl -s http://127.0.0.1:5000/api/health
curl -s http://127.0.0.1:5000/api/live/agora/config
```

Expect `ready:true` and the new `appId` after Agora credentials are set.

### Update Agora credentials on VPS

After creating a new Agora project (e.g. **ap-service**), SSH in and run:

```bash
cd /var/www/ap-services
AGORA_APP_ID=your_app_id AGORA_APP_CERTIFICATE=your_certificate \
  bash deploy/hostinger/update-agora-on-vps.sh
```

Or edit `/var/www/ap-services/backend/.env` manually, then `pm2 restart ap-api --update-env`.

Public: http://62.72.56.74:5000/api/health

## Next: domain + HTTPS (recommended)

1. Point `api.yourdomain.com` A record → `62.72.56.74`
2. Install Nginx + Certbot
3. Update `config/production-api.js` → `BACKEND_URL: 'https://api.yourdomain.com'`
4. Update `frontend/ap-config.js` to match
5. Update OAuth callback URLs in `backend/.env` on VPS
6. Redeploy Vercel frontend (`vercel.json` rewrite destination)

### Nginx snippet

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then: `certbot --nginx -d api.yourdomain.com`

## Frontend routing

| Context | API URL |
|---------|---------|
| Expo dev (LAN :5500) | Same-origin `/api` → dev-server proxies to VPS |
| Vercel (https) | Same-origin `/api` → Vercel rewrite to VPS |
| Native app | Direct VPS (`__AP_API_URL__` injected) |

Live Socket.IO: LAN dev proxies `/socket.io`; native app connects directly to VPS.
