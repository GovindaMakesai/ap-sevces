# AP Services — System Architecture

## Overview

AP Services is a dual-domain platform:

1. **Marketplace** — bookings, workers, services, reviews, chat (PostgreSQL, preserved)
2. **Creator Economy** — wallets, live rooms, agencies, PK, leaderboards, VIP, payments (PostgreSQL authoritative)

**Entry point:** `backend/server.js`  
**API version:** `/api/*` (legacy marketplace), `/api/v1/*` (Phase 2 platform)

## Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Clients (Web, Capacitor, Expo WebView)                 │
└───────────────────────────┬─────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   REST /api/*        REST /api/v1/*      Socket.io
         │                  │                  │
         ▼                  ▼                  ▼
   Controllers         platformController   liveSocket / pkSocket
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ▼
                      Service Layer
   wallet · gift · agency · commission · pk · leaderboard
   contest · vip · reward · verification · charity · payment
   fraud · audit · liveRoom · permission
                            │
                            ▼
                      PostgreSQL (source of truth)
                            │
              Optional: Redis (cache, rate limits)
```

## Database Migrations

| Migration | Purpose |
|-----------|---------|
| `database/schema.sql` | Marketplace base |
| `database/migrations/001_foundation.sql` | Wallet, RBAC, live rooms |
| `database/migrations/002_phase2_core.sql` | Agency, PK, leaderboards, VIP, payments, fraud |

Applied on startup via `ensure*Schema.js` helpers (idempotent).

## Module Boundaries

- **Never** use localStorage for balances or permissions
- All coin movements go through `walletService` with `FOR UPDATE` row locks
- Gifts trigger: ledger → platform fee → agency commission → leaderboard → charity → PK score
- Cron jobs in `backend/lib/scheduler.js` handle periodic settlement

## Health & Observability

- `GET /api/health` — DB + Redis mode
- Structured JSON logs via `backend/lib/logger.js`
- Request IDs via `X-Request-Id` header
- Graceful shutdown on SIGTERM/SIGINT

## TODO (production scaling)

- Wire `@socket.io/redis-adapter` for multi-instance sockets
- BullMQ queue for heavy settlement jobs (currently node-cron)
- Read replicas for leaderboard queries
- Separate payment webhook worker process
