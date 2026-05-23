# AP Services — Founder Policy Audit Report

**Audit date:** 2026-05-20  
**Scope:** Full repository (`frontend/`, `backend/`, `database/`, admin panels, sockets, configs)  
**Method:** Source inspection only — no assumptions from UI copy or marketing text.

---

## Executive Summary

This codebase is primarily a **home-services marketplace** (book workers, pay via manual QR, admin review) with a **social/live UI shell** layered on top (Explore, Party, Video, Square, VIP, Rankings). The founder policy notes describe a **multi-role agency economy** (coins/stars, commissions, PK battles, investor/coin-seller flows, automation, charity). **That economy is largely not built in backend or database.**

| Metric | Value |
|--------|-------|
| **Overall policy completion (founder vision)** | **~10%** |
| **Production-ready (marketplace core)** | **~65%** |
| **Production-ready (social/live economy)** | **~5%** |

---

## Summary Table

| Policy Group | Status | Completion % | Notes |
|--------------|--------|--------------|-------|
| 1 — Role & Agency System | ❌ Missing (with partial dashboards) | **12%** | Only `customer` / `worker` / `admin` in DB; no agency hierarchy |
| 2 — Coin / Wallet / Economy | ⚠️ Partially Implemented | **15%** | Coins in `localStorage`; booking platform fee only in backend |
| 3 — Live / Audio / PK / Contest | ⚠️ Partially Implemented | **18%** | Agora + Socket.io rooms exist; PK/contests/leaderboards are UI mocks |
| 4 — Investor / Coin Seller | ❌ Missing | **0%** | No modules, routes, or schema |
| 5 — Automation & Admin Control | ⚠️ Partially Implemented | **14%** | Manual admin workflows; no cron/automation; several admin UI calls have no API |
| 6 — Reward / Gamification | ❌ Missing | **5%** | Crowns/VIP text only; worker doc upload ≠ creator video verification |
| 7 — Charity / Donation / Social Impact | ❌ Missing | **0%** | Not found in codebase |

---

# Policy Group 1 — Role & Agency System

**Status: ❌ Missing (12%)** — Marketplace roles exist; agency/multi-tier executive roles do not.

## ✅ Fully Implemented (marketplace subset only)

| Feature | Evidence |
|---------|----------|
| **Worker dashboard** | `frontend/worker-dashboard.html`; APIs `GET /api/workers/dashboard`, `GET /api/workers/dashboard/stats`, `GET /api/workers/earnings` in `backend/routes/workers.js`, `backend/controllers/workerController.js` |
| **User (customer) dashboard** | `frontend/customer-dashboard.html`; booking APIs `backend/routes/bookings.js` |
| **Worker add / manage (approval flow)** | `POST /api/workers/register` (upload id/address/profile); admin `PUT /api/admin/workers/:workerId/approve` in `backend/routes/admin.js`, `backend/controllers/adminController.js`; schema `workers.approval_status` in `database/schema.sql` |
| **Basic role-based permissions** | `backend/middleware/auth.js` — `verifyToken`, `authorizeRoles(...)`; JWT carries `role` |

**Roles in database:** `users.role` CHECK constraint allows only `'customer' | 'worker' | 'admin'` (`database/schema.sql` lines 16–17). OAuth normalizes to same three roles (`backend/routes/auth.js` line 37).

## ⚠️ Partially Implemented

| Feature | What exists | What is missing |
|---------|-------------|-------------------|
| **Super admin dashboard** | `frontend/admin-dashboard.html`; APIs under `/api/admin/*` | Single `admin` role — no super-admin vs founder vs CEO separation; UI label "Super Administrator" is cosmetic (`admin-dashboard.html` ~1408) |
| **Creator dashboard** | `frontend/streamer-center.html`, `frontend/creator-profile.html` | No `creator` role, no backend stream stats, metrics hardcoded to `0` / `00:00:00` |
| **VIP dashboard** | `frontend/vip.html`, `frontend/privileges.html` | Marketing/tier UI only; no VIP entity, subscription, or privileges in DB/API |
| **Super host / agency rankings** | `frontend/rankings.html` + `SocialInteractions.initRankingsPage()` in `frontend/social-interactions.js` | Static mock arrays (`RANK_DATA` in `rankings.html`); not persisted or computed |
| **Platform commission** | `platform_fee = Math.round(total_amount * 0.1)` in `backend/controllers/bookingController.js` | Fixed **10%** on service bookings only — not 12%/16%/20% agency tiers |

## ❌ Missing

| Policy item | Status |
|-------------|--------|
| Founder dashboard | ❌ Not in codebase |
| CEO dashboard | ❌ |
| BDM dashboard | ❌ |
| Agency dashboard | ❌ |
| Contractor / Coin seller dashboard | ❌ |
| Agency hierarchy | ❌ |
| Agency ranking (backend) | ❌ |
| Super worker ranking | ❌ |
| Agency commission (12% / 16% / 20%) | ❌ |
| Performance-based level upgrades | ❌ |
| Restricted access between agencies | ❌ |

---

# Policy Group 2 — Coin / Wallet / Economy System

**Status: ⚠️ Partially Implemented (15%)**

## ✅ Backend-real

- **Platform fee on bookings** — `database/schema.sql`, `bookingController.createBooking`
- **Manual QR service payment + admin review** — `qr_manual` in `frontend/booking.html`; `PUT /api/admin/payments/:bookingId/approve|reject`
- **Worker earnings aggregation** — `GET /api/workers/earnings`

## ⚠️ Partial / client-only

| Feature | Location | Gap |
|---------|----------|-----|
| Coins wallet | `localStorage.social_coins` in `social-live.js`, `store.html` | No server ledger |
| Recharge | `coins-recharge.html`, `initCoinsRecharge()` | Instant client credit; no UTR API |
| Live gifts | `live:gift` socket + `spendCoins()` | No server debit/credit |
| Min withdrawal | `admin-dashboard.html` input | `PUT /admin/settings` **missing** |
| Withdrawal | `worker-dashboard.html` button | Toast: not available in backend |
| GST | `payment.html` display | Not in booking math |

## ❌ Missing

Star wallet, conversions (100K→92K), 70/20/8 splits, coin exchange, auto rewards, creator income, Epay/P2P coin payments.

---

# Policy Group 3 — Live / Audio / PK / Contest

**Status: ⚠️ Partially Implemented (18%)**

## Exists

- **Live rooms:** `live-room.html`, `POST /api/live/agora/token` (`liveController.js`)
- **Party/audio rooms:** `party-room.html`, seat grid via `liveSocket.js`
- **Socket events:** join, chat, gift, mute — in-memory `Map`
- **Rankings page:** static `RANK_DATA` in `rankings.html`
- **PK label:** cosmetic badge in `social-shell.js` `renderLiveCard()` — **not PK battles**

## Missing

All PK modes (1v1–1v8, timed 4/7/15 min), contests, VIP contests, persisted leaderboards (daily/weekly/monthly), live activity DB, worker active rewards.

---

# Policy Group 4 — Investor / Coin Seller

**Status: ❌ Missing (0%)** — No code, routes, or tables found.

---

# Policy Group 5 — Automation & Admin Control

**Status: ⚠️ Partially Implemented (14%)**

## Works (manual)

- Admin CRUD: users, workers, services, bookings, payments (`backend/routes/admin.js`)
- Payment approve/reject with socket notify
- Dashboard stats + analytics SQL

## Broken / stub UI

- `PUT /admin/settings` — **no route**
- `GET /admin/reviews`, `POST /admin/announcements` — **no routes**
- Report export — client toast only

## Missing

Cron jobs, auto rewards/coins/rankings/contests, auto withdrawal, audit log table, multi-tier super-admin ACL.

---

# Policy Group 6 — Reward / Gamification

**Status: ❌ Missing (5%)**

- Crown/VIP copy only (`vip.html`, `privileges.html`)
- `users.is_verified` exists — not a gamification crown system
- Worker `id_proof_url` — marketplace KYC, not creator video verification
- No 15-min / 7-day / hourly reward engines

---

# Policy Group 7 — Charity / Donation

**Status: ❌ Missing (0%)**

---

# HIGH PRIORITY MISSING FEATURES

### Backend critical
1. Server wallet ledger (coins/stars + transactions)
2. Agency/role schema beyond 3 roles
3. Gift economy with server-side balance checks
4. JWT auth on live socket (chat has it; live does not)
5. Persist live/gift data; Redis for multi-instance
6. Fix missing admin APIs or remove UI calls
7. Add `notifications` tables to `schema.sql`

### Payment critical
1. Recharge UTR → admin queue → credit (replace localStorage instant credit)
2. Withdrawal + payout pipeline
3. Commission/split engine (12/16/20%, 70/20/8, star conversion)
4. Remove debug endpoint `GET /api/debug/generate-hash` from production

### Realtime / live critical
1. PK battle state machine
2. Leaderboard batch jobs
3. Redis Socket.io adapter

### Admin critical
1. Multi-tier RBAC
2. Financial audit log
3. Coin seller / investor panels

### UI only (after backend)
Wire rankings, VIP, streamer stats, charity UI to real APIs.

---

# ARCHITECTURE RISKS

| Category | Risk |
|----------|------|
| **Security** | Client-side coins; unauthenticated live socket; single omnipotent `admin` role |
| **Payments** | Fake coin credit on recharge; no gift double-spend protection |
| **Scale** | In-memory live rooms; localStorage social graph |
| **Ops** | Admin settings UI calls dead endpoints; notifications schema may be missing on fresh DB |
| **Deploy** | Render multi-instance breaks live room state without Redis |

---

# WHAT IS PRODUCTION READY

**Marketplace (~65%):** Auth, worker onboarding/approval, services, bookings, QR payment review, reviews, chat (JWT), worker/customer dashboards, core admin panel.

**Social/live (~5% demo):** UI shell, Agora tokens when configured, party room prototype — **not** a production economy.

---

# WHAT WILL BREAK UNDER SCALE

1. In-memory live state on restart / multi-node  
2. localStorage coins and posts (fraud, no sync)  
3. Manual QR for high-volume coin sales  
4. Missing notification tables on new DB installs  
5. Gift spam without rate limits or server wallets  

---

# Overall Completion: **~10%**

Group averages: (12 + 15 + 18 + 0 + 14 + 5 + 0) / 7 ≈ **9.1%** → **~10%** of founder policy modules implemented with backend truth.

*Audit performed by full-repo search and file inspection. Features not found in source are marked missing, not assumed.*
