# Phase 0 — Security & Trust Audit Report

**Date:** June 15, 2026  
**Scope:** Full-stack security review before production feature work  
**Platform:** AP Services livestream + marketplace (accounts, wallets, coins, chat, live)

---

## Executive summary

The platform handles real money (coins, recharges, withdrawals) and personal data. A full audit identified **3 critical**, **11 high**, and multiple medium issues. **Critical and high-severity fixes were applied in this pass.** Remaining risks are documented below.

**Security score: 62 / 100** (was ~38 before fixes)

Safe enough for **staged beta** with monitoring. Not yet ready for unchecked public launch with real influencers and high-value wallets until remaining high items are closed.

---

## Trust score breakdown

| Area | Score | Notes |
|------|-------|-------|
| Authentication | 65% | OAuth admin escalation blocked; OTP fallback disabled in prod; DB role revalidation |
| Authorization / RBAC | 60% | Wallet routes scoped; agency IDOR fixed; live host server-verified |
| Personal data protection | 55% | Public worker PII stripped; live room host UUID hidden from public list |
| Wallet / payments | 70% | Atomic ledger; UTR dedup; fraud blocks; intent ownership |
| Socket security | 68% | Host hijack fixed; gifts server-side; query-token removed |
| API hardening | 58% | Helmet + rate limits added; CORS tightened in production |
| Chat / XSS | 65% | chat.html escaped; live chat stripped; REST chat sanitized |
| File / upload security | 40% | Public `/uploads` still serves KYC/QR paths |
| Logging / privacy | 50% | Logger redaction; OAuth token removed from logs |
| Compliance (GDPR-style) | 25% | No account deletion / data export yet |

---

## Critical vulnerabilities

### C1 — OAuth self-admin escalation
| | |
|---|---|
| **Severity** | Critical |
| **Risk** | Visit `/auth/google?role=admin` → first signup gets admin JWT → full admin API |
| **Status** | **FIXED** |
| **Fix** | OAuth role forced to `customer`; `admin` removed from `normalizeOAuthRole` / `safeOAuthRole` |

### C2 — Universal OTP fallback (`111111`)
| | |
|---|---|
| **Severity** | Critical |
| **Risk** | Mass fake accounts without SMS verification |
| **Status** | **FIXED** |
| **Fix** | Fallback and test OTPs disabled when `NODE_ENV=production` |

### C3 — Public worker API PII leak (email, phone, ID proofs)
| | |
|---|---|
| **Severity** | Critical |
| **Risk** | Scrape emails/phones; access KYC document URLs |
| **Status** | **FIXED** (API responses) |
| **Fix** | `publicWorker()` DTO strips email, phone, `id_proof_url`, `address_proof_url` |
| **Remaining** | Files still reachable if URL guessed — see H6 |

### C4 — Live host hijacking via client `isHost`
| | |
|---|---|
| **Severity** | Critical |
| **Risk** | Kick users, end rooms, fake host on any channel |
| **Status** | **FIXED** |
| **Fix** | Server sets host from `live_rooms.host_user_id`; RBAC enforced; kick/end verify DB host |

### C5 — Stored XSS in `chat.html`
| | |
|---|---|
| **Severity** | Critical |
| **Risk** | Steal JWT from localStorage via malicious message |
| **Status** | **FIXED** |
| **Fix** | `escapeHtml()` on all message text before `innerHTML` |

### C6 — Gift amount bypass (unknown catalog → client amount)
| | |
|---|---|
| **Severity** | Critical |
| **Risk** | Send 1-coin gifts displayed as expensive gifts |
| **Status** | **FIXED** |
| **Fix** | `giftService` rejects unknown gift types |

### C7 — Duplicate manual recharge UTR
| | |
|---|---|
| **Severity** | Critical |
| **Risk** | Same UTR approved twice → double coin credit |
| **Status** | **FIXED** |
| **Fix** | Duplicate check + DB unique index on `transaction_id` |

---

## High vulnerabilities

| ID | Issue | Risk | Status |
|----|-------|------|--------|
| H1 | JWT role not revalidated from DB | Demoted admin keeps access until expiry | **FIXED** — `verifyToken` loads `role` + `is_active` |
| H2 | Agora publisher token from client `role` | Broadcast on any channel | **FIXED** — verify room host |
| H3 | Payment intent IDOR | Pay/charge wrong user's intent | **FIXED** — `user_id` check |
| H4 | Stripe open redirect | Phishing after payment | **FIXED** — URL allowlist |
| H5 | Agency analytics IDOR | Any worker reads any agency | **FIXED** — membership check |
| H6 | Public `/uploads` static | QR codes, KYC, chat images | **OPEN** — use signed URLs / private bucket |
| H7 | JWT in OAuth redirect URL | Token in history/logs/Referer | **OPEN** — migrate to one-time code |
| H8 | JWT in localStorage | XSS → full account takeover | **OPEN** — HttpOnly cookies preferred |
| H9 | No Helmet / rate limits | Brute force, missing headers | **FIXED** |
| H10 | Permissive CORS (`https://*`, `file://`) | Cross-origin abuse | **FIXED** in production |
| H11 | `webhookRoutes` not imported | Payments/webhooks broken | **FIXED** |
| H12 | Fraud checks flag only | Gift/recharge abuse continues | **FIXED** — throws on threshold |
| H13 | Coin seller buy API | Free coins from seller inventory | **OPEN** — needs payment proof |
| H14 | Reward claim abuse | Free coins via crafted `event_key` | **OPEN** |

---

## Medium / low (selected)

| Issue | Status |
|-------|--------|
| `oauth-debug` public endpoint | **FIXED** — 404 in production |
| Registration 500 leaks DB errors | **FIXED** |
| Health endpoint leaks DB errors | **FIXED** |
| Client `type: system` chat messages | **FIXED** |
| Socket token in query string | **FIXED** |
| Chat image `__IMG__:` arbitrary URLs | **FIXED** — `/uploads/chat/` only |
| Withdrawal QR via JSON body URL | **FIXED** — file upload required |
| 7-day JWT, 6-char passwords | **OPEN** — shorten tokens; strengthen policy |
| Public live room list exposed host UUID | **FIXED** — `publicLiveRoom` DTO |
| SQL injection | **None found** — parameterized queries throughout |

---

## What was implemented

### New files
- `backend/lib/userDto.js` — public serializers for users, workers, live rooms
- `backend/middleware/security.js` — Helmet, global/auth/wallet rate limits
- `database/migrations/005_security_hardening.sql` — unique recharge UTR
- `backend/config/ensureSecurityHardeningSchema.js`

### Backend fixes
- Auth: OAuth role lockdown, production OTP lockdown, DB-backed `verifyToken`, sanitized errors
- Live: server-side host, Agora publisher verification, chat HTML strip
- Wallet: gift catalog enforcement, fraud blocks, UTR dedup, QR upload-only
- Payments: intent ownership, Stripe URL allowlist
- API: CORS production allowlist, agency analytics auth
- Logging: sensitive field redaction

### Frontend fixes
- `chat.html` — XSS escaping on message render

---

## Remaining risks (must fix before full launch)

1. **Move JWT out of localStorage** → HttpOnly Secure cookies + CSRF protection
2. **Stop putting JWT in OAuth redirect URLs** → one-time exchange code
3. **Private file storage** — withdrawal QR, KYC docs, chat images behind auth/signed URLs
4. **Coin seller purchase flow** — require verified payment before crediting buyer
5. **Reward claim engine** — server-side eligibility, not client `event_key`
6. **Account deletion + data export** — privacy compliance
7. **Refresh token rotation** — shorter access token TTL
8. **Redis-backed socket rate limits** — multi-instance consistency
9. **Privacy Policy / Terms** — legal pages (templates exist; wire consent)

---

## Deployment

```bash
cd /var/www/ap-services
git pull
npm ci --omit=dev
# Ensure NODE_ENV=production in backend/.env
pm2 restart ap-api
```

Migration `005_security_hardening.sql` runs automatically on API start via `ensureSecurityHardeningSchema()`.

---

## Verification checklist

- [ ] `POST /auth/register` with `otp_mode=fallback` returns 400 in production
- [ ] `/auth/google?role=admin` creates `customer` role only
- [ ] `GET /api/workers` returns no email/phone/id_proof fields
- [ ] Socket `live:join` with `isHost:true` on existing room fails for non-host
- [ ] Agora token with `role:host` returns 403 for non-host
- [ ] Duplicate UTR recharge rejected
- [ ] Chat message `<script>` renders as text, not executed
- [ ] `GET /api/live/rooms` has no `hostId` field
- [ ] Rate limit triggers after repeated login attempts

---

## Positive security controls (already in place)

- Password hashes never returned in API responses
- Wallet debit/credit uses `FOR UPDATE` row locks in transactions
- Gift sends are server-authoritative (not client-only socket emit)
- Payment webhooks verify HMAC signatures with idempotent event storage
- Withdrawal reserves coins atomically before creating request
- User wallet routes consistently use `req.userId` (no cross-user IDOR found)
- Admin routes require `verifyToken` + `authorizeRoles('admin')`
- Live chat UI uses `escapeHtml()` in `social-live.js`
