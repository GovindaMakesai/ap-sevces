# Component Implementation Plan — Production Ready

**Date:** 2026-06-12

---

## Architecture

```
frontend/
├── social-fx.js          # Animation & engagement engine (NEW)
├── social-fx.css         # FX styles + design tokens (NEW)
├── social-live.js        # Room logic — hooks into SocialFX
├── social-wallet.js      # Wallet — balance animation hook
└── pages/*.html          # Include fx scripts before social-live.js
```

**Note:** Stack is vanilla web (not React Native). Reanimated/Gesture Handler/FlashList equivalents:
- Animations → `social-fx.js` + CSS + optional `lottie-web`
- Gestures → touch events (double-tap like)
- Lists → DOM virtual scroll (future)

---

## Component Map

### `SocialFX` (social-fx.js)

| Method | Purpose |
|--------|---------|
| `init(root)` | Create overlay layers, load Lottie |
| `playGift(gift, opts)` | Tiered gift animation |
| `trackCombo(giftKey, qty)` | Combo multiplier state |
| `showJoinBanner(user)` | Viewer join slide-in |
| `showFollowBurst(anchor)` | Heart explosion on follow |
| `spawnLike(x, y)` | Double-tap hearts |
| `animateBalance(el, from, to)` | Odometer roll |
| `coinFly(fromEl, toEl, amount)` | Coin trajectory |
| `coinRain(count)` | Purchase/reward celebration |
| `confetti(opts)` | Canvas confetti |
| `screenShake(intensity)` | Premium gift impact |
| `haptic(pattern)` | Vibration API |
| `pkCountdown(sec, onDone)` | 3-2-1 overlay |
| `pkScoreUpdate(left, right)` | Animated bar |
| `pkWinner(side)` | Celebration/defeat |
| `setSpeaking(userId, active)` | Audio room waves |
| `pushActivity(event)` | Activity ticker feed |
| `getUserLevel(userId)` | Level badge helper |
| `getGiftTier(gift)` | small/medium/premium |

### Integration Points in `social-live.js`

| Hook | Location |
|------|----------|
| `SocialFX.init()` | `bindCommonControls` |
| `SocialFX.playGift` | `live:gift` handler + `finishOk` |
| `SocialFX.trackCombo` | `sendSelectedGift` |
| `SocialFX.showJoinBanner` | viewer count increase |
| `SocialFX.showFollowBurst` | `toggleFollow` |
| `SocialFX.spawnLike` | double-tap on video |
| `SocialFX.animateBalance` | `refreshCoinDisplay` |
| PK socket handlers | `connectSocket` |
| `SocialFX.setSpeaking` | Agora `volume-indicator` |
| Activity feed | join/gift/follow/chat events |

---

## Gift Tier Classification

| Tier | Cost Range | FX |
|------|------------|-----|
| small | < 500 | 3-8 floating particles |
| medium | 500–49,999 | Banner + float + sound |
| premium | ≥ 50,000 | Fullscreen + shake + haptic + spotlight |

### Premium gift mapping

Yacht 🛥️, Lion 🦁, Dragon (🐉/🦁), Palace 🏝️, Rocket 🚀, Super Car 🏎️, Crown 👑, Heart Voyage 🛥️

---

## Combo System

- Window: 3 seconds between same-gift sends
- Multipliers: x1, x5, x10, x20, x50, x100 (qty buttons)
- Display: floating badge above gift bar
- Explosion at x10+

---

## PK Battle Flow

1. `pk:start` socket → `SocialFX.pkCountdown(5)`
2. `pk:score` socket → `SocialFX.pkScoreUpdate`
3. `pk:end` socket → `SocialFX.pkWinner`
4. Remove `?pk=1` random score initialization

---

## Performance Budget

| Metric | Target | Technique |
|--------|--------|-----------|
| FPS | 60 | `transform`/`opacity` only |
| Overlay DOM | < 50 nodes | Pool and recycle |
| Lottie instances | ≤ 2 concurrent | Queue premium gifts |
| Confetti particles | ≤ 80 | Canvas, not DOM |

---

## HTML Script Order

```html
<link rel="stylesheet" href="social-fx.css">
<script src="social-fx.js"></script>
<script src="social-live.js"></script>
```

---

## Testing Checklist

- [ ] Send rose → floating hearts
- [ ] Send yacht → fullscreen + shake
- [ ] Rapid send → combo multiplier climbs
- [ ] Double-tap video → hearts float
- [ ] Follow → heart burst
- [ ] Viewer join → banner appears
- [ ] Party mic on → seat ring pulses
- [ ] PK start → countdown → score bar animates
- [ ] Chest timer 0 → coin burst
- [ ] Balance updates roll smoothly

---

## Backend Dependencies (Future PRs)

1. Gift catalog API
2. Follow API
3. PK challenge flow
4. FCM push
5. Server-side combo validation
