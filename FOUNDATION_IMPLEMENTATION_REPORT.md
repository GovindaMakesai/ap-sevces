# Foundation Implementation Report — Phase 1

**Date:** 2026-05-20  
**Scope:** Security + Economy foundation (PROJECT_POLICY_AUDIT.md Phase 1)

---

## Completed Systems

| Step | System | Status |
|------|--------|--------|
| 1 | Remove client-side coin authority | ✅ Done |
| 2 | Database wallet tables | ✅ Done |
| 3 | Secure transaction engine (Wallet/Transaction/Gift services) | ✅ Done |
| 4 | Secure live socket JWT auth + rate limits | ✅ Done |
| 5 | Persistent live room system (DB-backed) | ✅ Done |
| 6 | Role hierarchy + RBAC tables/middleware | ✅ Done |
| 7 | Withdrawal backend + admin workflow | ✅ Done |
| 8 | Remove production risks (debug hash route) | ✅ Done |
| 9 | Migrations + documentation | ✅ This report |

---

## Changed / Created Files

### Backend
| File | Purpose |
|------|---------|
| `database/migrations/001_foundation.sql` | Wallet, RBAC, live room, recharge/withdrawal schema |
| `backend/config/ensureFoundationSchema.js` | Idempotent migration + RBAC seed on startup |
| `backend/lib/redis.js` | Redis abstraction stub (in-memory fallback) |
| `backend/services/walletService.js` | Atomic balance updates with row locks |
| `backend/services/transactionService.js` | Recharge/withdrawal admin flows |
| `backend/services/giftService.js` | Atomic gift debit/credit + platform fee |
| `backend/services/liveRoomService.js` | DB-backed live rooms, members, events |
| `backend/services/permissionService.js` | RBAC permission resolution |
| `backend/middleware/permissions.js` | `requirePermission` route guard |
| `backend/controllers/walletController.js` | Wallet REST handlers |
| `backend/routes/wallet.js` | User wallet routes |
| `backend/routes/admin.js` | Admin recharge/withdrawal approval routes |
| `backend/socket/liveSocket.js` | JWT auth, rate limits, server-side gifts |
| `backend/middleware/auth.js` | Expanded admin role hierarchy |
| `backend/server.js` | Wire foundation schema, wallet routes, remove debug route |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/social-wallet.js` | Backend wallet client (no localStorage coins) |
| `frontend/social-live.js` | Gifts/recharge via API + socket ack |
| `frontend/social-interactions.js` | Post/reel gifts via API |
| `frontend/store.html`, `coins-recharge.html`, `profile-tab.html`, `party-room.html`, `live-room.html`, `video.html` | Load `social-wallet.js`, fetch balance from API |

---

## Database Tables Created

```sql
platform_settings
roles, permissions, role_permissions, user_roles
wallets
wallet_transactions
recharges
withdrawals
gift_transactions
live_rooms
live_room_members
live_room_events
```

Also expands `users.role` CHECK constraint to include: `founder`, `ceo`, `super_admin`, `bdm`, `agency`, `creator`, `vip_user`, `coin_seller`.

---

## New API Routes

### User (`/api/wallet` — JWT + permission required)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/wallet/balance` | `wallet.read` | Authoritative coin/star balance |
| GET | `/api/wallet/transactions` | `wallet.read` | Transaction history |
| GET | `/api/wallet/withdrawals` | `wallet.read` | User withdrawal history |
| POST | `/api/wallet/recharge` | `wallet.recharge` | Submit UTR recharge (pending admin) |
| POST | `/api/wallet/withdraw` | `wallet.withdraw` | Request withdrawal (holds coins) |
| POST | `/api/wallet/gifts` | `wallet.gift` | Send gift (REST — posts/reels) |

### Admin (`/api/admin` — JWT + admin role + permission)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/admin/recharges/pending` | `admin.recharges` | Pending recharge queue |
| POST | `/api/admin/recharges/:id/approve` | `admin.recharges` | Credit wallet after verification |
| POST | `/api/admin/recharges/:id/reject` | `admin.recharges` | Reject recharge |
| GET | `/api/admin/withdrawals/pending` | `admin.withdrawals` | Pending withdrawal queue |
| POST | `/api/admin/withdrawals/:id/approve` | `admin.withdrawals` | Mark withdrawal approved |
| POST | `/api/admin/withdrawals/:id/reject` | `admin.withdrawals` | Reject + refund held coins |

### Socket (live namespace — JWT required)

| Event | Auth | Notes |
|-------|------|-------|
| `live:join` | JWT + `live.join` / `live.host` | Persists room to DB |
| `live:chat` | JWT | Rate limited (20/10s) |
| `live:gift` | JWT + `wallet.gift` | Server debits via GiftService |
| `live:leave` | JWT | Updates DB membership |

---

## Security Improvements

1. **Removed** `GET /api/debug/generate-hash` — exposed password hash generator.
2. **Removed** all `localStorage.social_coins` usage — balances only from PostgreSQL.
3. **Atomic transactions** — `SELECT … FOR UPDATE` on wallet rows; rollback on failure.
4. **Negative balance prevention** — DB CHECK constraints + service-layer validation.
5. **Live socket JWT** — unauthenticated connections rejected (mirrors chat socket).
6. **Rate limiting** — chat/gift flood protection per socket.
7. **RBAC** — permissions resolved server-side from `roles` + `user_roles` tables.
8. **Gift platform fee** — configurable via `platform_settings.wallet.gift_platform_fee_pct`.

---

## Migration Steps

### Automatic (recommended)
Foundation schema runs on server startup via `ensureFoundationSchema()`.

```bash
# Ensure DATABASE_URL is set in backend/.env
npm start
# Look for: ✅ Foundation schema ready (wallets, live rooms, RBAC)
```

### Manual
```bash
npm run db:migrate:foundation
```

Or apply SQL directly:
```bash
psql $DATABASE_URL -f database/migrations/001_foundation.sql
```

---

## Testing Steps

### 1. Wallet balance
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/wallet/balance
```

### 2. Recharge flow
1. POST `/api/wallet/recharge` with `{ amount_inr: 199, transaction_id: "UTR123456789" }`
2. Admin: GET `/api/admin/recharges/pending`
3. Admin: POST `/api/admin/recharges/:id/approve`
4. User balance should increase by `amount_inr × coins_per_inr` (default 10)

### 3. Gift flow (REST)
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"receiver_id":"<uuid>","coin_amount":10,"gift_type":"post_gift"}' \
  http://localhost:5000/api/wallet/gifts
```

### 4. Live gift (socket)
1. Open party-room as host (logged in)
2. Second user joins same channel
3. Send gift — sender balance decreases, host receives creator share minus platform fee

### 5. Withdrawal
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"amount":500}' http://localhost:5000/api/wallet/withdraw
```
Admin approves/rejects via `/api/admin/withdrawals/:id/approve|reject`.

### 6. Verify no client coin authority
- DevTools → Application → localStorage — `social_coins` should not be written
- Manually set `localStorage.social_coins = 999999` — UI should still show DB balance

---

## Architecture Notes

```
Client (social-wallet.js)
    ↓ JWT
/api/wallet/*  →  WalletService / GiftService / TransactionService
    ↓ FOR UPDATE
PostgreSQL (wallets, wallet_transactions, gift_transactions)

Live Socket (JWT)
    ↓
LiveRoomService (persist rooms) + GiftService (debit gifts)
```

- **Redis:** `backend/lib/redis.js` provides stub; live room hot cache is in-memory Map with DB as source of truth. TODO: wire Redis for multi-instance deployment.
- **Marketplace preserved:** Bookings, workers, admin payment approval, chat socket unchanged.

---

## Remaining Blockers / Phase 2

| Item | Priority | Notes |
|------|----------|-------|
| Admin UI for recharge/withdrawal queues | High | Backend ready; admin dashboard needs wallet tabs |
| Worker withdrawal UI wiring | High | Connect `worker-dashboard.html` to `/api/wallet/withdraw` |
| Store item purchases | Medium | Store still display-only; needs debit + inventory |
| VIP / coin seller dashboards | Medium | Roles seeded; no dedicated UI |
| Redis socket adapter | Medium | Required before horizontal scaling |
| Live room mute persistence | Low | `live:mute` handler stubbed |
| Payment gateway integration | Medium | Recharge still manual UTR + admin approval |
| Agora token production config | High | Ensure env vars on Render/Vercel |

---

## Platform Settings (defaults)

Stored in `platform_settings` key `wallet`:

```json
{
  "min_withdrawal_coins": 500,
  "gift_platform_fee_pct": 20,
  "starter_coins": 0,
  "coins_per_inr": 10
}
```

Update via SQL or future admin settings API.
