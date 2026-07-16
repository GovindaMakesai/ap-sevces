# Referral & Host Recruitment Module

Isolated enterprise module. **Does not modify** auth, live stream, or wallet core logic.

## Mount points (`server.js`)

| Prefix | Purpose |
|--------|---------|
| `/api/referral/*` | Invite, dashboard, missions, admin |
| `/api/host/*` | Broadcast start/end/stats/progress |
| `/api/leaderboard/referral` | Invite leaderboard |
| `/api/reward/claim` | Claim scheduled referral rewards |

## Frontend

- `frontend/referral.html` — Invite Friends hub
- Profile menu → **Invite Friends & Rewards**
- `frontend/referral-hook.js` — applies `?ref=` after login without touching Auth

## Boot

`referralModule.boot()` runs schema ensure + reward scheduler on server start.

## Extending

All rewards stay pending until the user taps Receive, then pay through `walletService.creditStars` (points only) with `type: 'referral_reward'`.
Admin settings live in `referral_settings` (no hardcoding for mission amounts).
