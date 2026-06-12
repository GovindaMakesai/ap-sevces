# Missing Monetization Report — Live Experience Audit

**Date:** 2026-06-12

---

## Core Problem

Monetization **backend exists** (wallet, gifts, withdrawals) but **frontend does not create spending desire**. Premium gifts look identical to free emojis. No combo pressure, no lucky multipliers, no visual ROI for spending.

---

## Gap Analysis vs Competitors

### Gift Economy

| Feature | Bigo/MICO | AP Services |
|---------|-----------|-------------|
| Gift catalog from server | ✅ CDN assets | ❌ Client hardcoded |
| Price authority | Server | Client sends `amount` |
| Small gift feedback | Float + sound | None |
| Premium full-screen | SVGA 3-5s | CSS banner |
| Combo multiplier | x2-x100 visible | Qty buttons only |
| Combo timer pressure | 3s window | None |
| Lucky gift roulette | Animated wheel | Static page |
| Global gift broadcast | All rooms | None |
| Gift wall on profile | Lifetime showcase | "Lit: 0/12" static |

### Recharge UX

| Feature | Bigo/MICO | AP Services |
|---------|-----------|-------------|
| In-room one-tap top-up | ✅ | Sheet → separate page |
| IAP (Apple/Google) | ✅ | Manual UPI QR only |
| First recharge bonus | 2x coins banner | None |
| Currency consistency | Single currency | INR + USD mixed |
| Purchase success FX | Coin rain | None |
| Low balance warning | Shake + prompt | Toast on send fail |
| USD pack selection | N/A for India | Non-functional Google Pay btn |

### Creator Earnings

| Feature | Status |
|---------|--------|
| Real-time earnings ticker | Missing |
| Gift revenue breakdown | Backend only |
| Withdrawable balance indicator | Separate page |
| Diamond/star secondary currency | `star_balance` unused in UI |

### VIP / Premium Tiers

| Feature | Status |
|---------|--------|
| VIP badge in room | Missing |
| VIP entry animation | Missing |
| VIP-exclusive gifts | Tag only, no lock |
| VIP discount on gifts | Missing |
| Fan club paid membership | Missing |

### Leaderboard Monetization

| Feature | Status |
|---------|--------|
| Daily/weekly/monthly tabs | UI tabs, hardcoded data |
| Rank rewards | Text only |
| "Spend to climb" CTA | Missing |
| Top spender spotlight in room | Partial |

---

## Monetization Fixes Implemented

1. **Tiered gift FX** — premium gifts trigger fullscreen + shake + haptic
2. **Combo system** — multiplier display drives repeat sends
3. **Coin fly animation** — visual cost on send
4. **Balance odometer** — animated wallet update
5. **Chest reward** — coins on timer complete (engagement → spend loop)
6. **Qty buttons** — x1, x5, x10, x20, x50, x100
7. **Low balance shake** — on insufficient coins

## Still Required (Backend)

- Server-side gift catalog + price validation
- IAP integration (Razorpay/Stripe in-app)
- Lucky gift probability engine
- First recharge bonus rule
- Unified INR pricing in top-up sheet
