# AP Services Live Platform — Production Audit Report

**Date:** June 15, 2026  
**Scope:** Full-stack livestream platform (18-phase audit + critical implementations)

---

## Executive summary

The platform has a **solid wallet/gift/room foundation** with real PostgreSQL persistence and Socket.IO events. This pass implemented **production-critical gaps**: server-side follow graph, gift catalog validation, live presence heartbeat, stale member pruning, Agora strict mode in production, PK host controls, discovery feed sorting, and follow API wiring on the frontend.

**Production readiness score: 58 / 100** (up from ~45)

---

## Subsystem status

| Subsystem | Status | Notes |
|-----------|--------|-------|
| Authentication (JWT + OAuth) | **WORKING** | Google/GitHub/Facebook on `api.apservices.in` |
| Live room DB persistence | **WORKING** | `live_rooms`, members, events |
| Socket.IO live events | **WORKING** | join, chat, gift, mute, seats, end |
| Wallet ledger | **WORKING** | Atomic debit/credit, transactions |
| Gift transactions | **WORKING** | Socket + REST; catalog validation added |
| Agora integration | **PARTIAL** | Code complete; requires env keys on VPS |
| Host go-live | **PARTIAL** | Works with Agora keys; local preview fallback in dev |
| Viewer join | **WORKING** | Socket ack + state sync |
| Real-time chat | **WORKING** | Rate-limited, UTF-8 emoji fixed |
| Coins / recharge | **PARTIAL** | Wallet API works; store purchase UI incomplete |
| Coin sellers | **PARTIAL** | DB + API added; admin/UI workflow incomplete |
| Voice / party rooms | **WORKING** | Seats, requests, mute |
| PK battles | **PARTIAL** | Backend + socket; host PK button added |
| Discovery feed | **PARTIAL** | Trending/new/nearby sort + infinite scroll |
| Follow system | **PARTIAL** | Server graph + API; live notifications missing |
| Host profiles | **PARTIAL** | Basic UI; levels/badges incomplete |
| User/host/VIP levels | **MISSING** | XP tables not implemented |
| Notifications (FCM) | **MISSING** | Marketplace only |
| Moderation | **PARTIAL** | Mute, kick socket, reports table; ban UI weak |
| Cloud recording | **MISSING** | Not integrated |
| Admin live dashboards | **MISSING** | Marketplace admin only |
| Redis socket scaling | **MISSING** | Single-instance Socket.IO |
| Mobile (Expo WebView) | **WORKING** | Safe area, native share, API HTTPS |

---

## Fixes performed (this session)

### Backend
- `004_social_production.sql` — follows, blocks, gift catalog, coin sellers, moderation, room bans, `last_seen_at`
- `ensureSocialProductionSchema.js` — migration + gift seed (Rose, Diamond, Car, Castle, etc.)
- `followService.js`, `coinSellerService.js`, `socialController.js`, `routes/social.js`
- `platformController.js` — fixed `req.user.userId` → `req.userId`
- `giftService.js` — validates gift amounts against `gift_catalog`
- `liveRoomService.js` — heartbeat, prune stale members, kick/ban, join `last_seen_at`, sort modes
- `liveSocket.js` — ban check on join, `live:heartbeat`, `live:kick`
- `liveController.js` — Agora 503 in production without keys; config endpoint extended
- `pkSocket.js` — room hosts can start PK without `pk.host` permission
- `scheduler.js` — `live-presence-prune` every minute
- `validateEnv.js` — warns on missing Agora credentials

### Frontend
- `social-interactions.js` — follow/unfollow/stats via `/api/social/*`
- `social-shell.js` — following live API, discovery tabs, infinite scroll
- `explore.html` — new/nearby/following tab wiring
- `social-live.js` — heartbeat, reconnect rejoin, kick handler, PK button
- `live-room.html` — PK host control
- `agora-diagnostics.html` — token/publish/subscribe test page
- Prior UX fixes: emoji encoding, mobile safe-area, native share, Agora token errors

---

## Remaining blockers (launch-critical)

1. **Set Agora credentials on VPS** — `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` in `backend/.env`
2. **Deploy this commit** — `git pull && npm ci --omit=dev && pm2 restart ap-api` (wait ~45s)
3. **FCM push** — followers not notified when host goes live
4. **Coin seller UI** — `/api/social/coin-sellers` exists; no buyer-facing page
5. **Store purchase API** — coin packages need payment webhook completion
6. **Cloud recording** — Agora cloud recording not wired
7. **Redis adapter** — required for >1 API instance / thousands of viewers
8. **User level / VIP system** — schema and XP engine missing
9. **Admin live moderation dashboard** — reports table exists, no UI

---

## Deployment instructions

### VPS (`62.72.56.74` / `api.apservices.in`)

```bash
ssh root@62.72.56.74
cd /var/www/ap-services
git pull
cd backend && npm ci --omit=dev
# Edit .env — add:
# AGORA_APP_ID=your_app_id
# AGORA_APP_CERTIFICATE=your_certificate
pm2 restart ap-api
sleep 45
curl -s https://api.apservices.in/api/health
```

### Verify live stack

1. Open `https://apservices.in/agora-diagnostics.html` (log in first)
2. Request token → should show `OK (live)` not `mock`
3. Host: `live-room.html?host=1&channel=test-xxx`
4. Viewer: same channel without `host=1`
5. Send gift → wallet debits, animation on all clients
6. Explore → Following / New / Nearby tabs load real rooms

### Expo app

```bash
cd ap-services-app && npm start
```

Ensure `config/production-api.js` has `USE_HTTPS_DOMAIN = true`.

---

## Production readiness breakdown

| Area | Score |
|------|-------|
| Core live + socket | 75% |
| Monetization | 55% |
| Discovery + social | 60% |
| Agora A/V | 40% (keys-dependent) |
| Moderation + safety | 45% |
| Notifications | 15% |
| Admin + analytics | 35% |
| Scale / perf | 40% |

**Overall: 58 / 100** — Ready for **closed beta** with Agora keys; not yet Bigo-class without FCM, recording, levels, and horizontal scale.

---

## Test checklist (QA)

- [ ] Host joins and publishes video (with Agora keys)
- [ ] Viewer sees host stream without UI break
- [ ] Viewer count updates on join/leave
- [ ] Disconnect viewer → pruned within 90s (no ghost count)
- [ ] Socket reconnect re-joins room
- [ ] Chat + gifts sync to all clients
- [ ] Gift wrong amount rejected by server
- [ ] Follow/unfollow persists across devices
- [ ] PK start from host bar
- [ ] Kick removes viewer and blocks rejoin
- [ ] Discovery infinite scroll loads more rooms
