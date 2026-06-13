# Hostinger VPS deployment

Production backend: **http://62.72.56.74:5000**

Central config (update when you add domain + HTTPS):

- `config/production-api.js` — Node (dev-server, Expo app)
- `frontend/ap-config.js` — browser (keep in sync)

## On the VPS (after each deploy)

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
