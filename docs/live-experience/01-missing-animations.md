# Missing Animation Report — Live Experience Audit

**Date:** 2026-06-12  
**Screens audited:** `live-room.html`, `party-room.html`, `explore.html`, `party.html`, `video.html`, `rankings.html`, `lucky-gifts.html`, `coins-recharge.html`, `store.html`, `profile-tab.html`, `chat.html`

---

## Executive Finding

**0% of user actions trigger premium animations.** The app uses static CSS and occasional 4.5s toast banners. Industry platforms (Bigo, TikTok Live, MICO) animate **every** monetary and social event.

---

## Screen-by-Screen Gap Analysis

### Live Room (`live-room.html` + `social-live.js`)

| Interaction | Industry Standard | Current State | Priority |
|-------------|-------------------|---------------|----------|
| Room enter | Loader → fade-in video + host card slide | Static loader hide | P0 |
| Viewer join | Avatar banner slides from top | None | P0 |
| Viewer leave | Fade-out ghost | None | P1 |
| Gift send (small) | Floating emoji trail to host | 4.5s text banner only | P0 |
| Gift send (premium) | Full-screen SVGA + sound + shake | None | P0 |
| Gift combo | Multiplier badge + explosion | None | P0 |
| Follow host | Heart burst + confetti | Text toast only | P0 |
| Like stream | Floating hearts from bottom | None | P0 |
| New follower alert | Entry banner on host side | None | P1 |
| Viewer count change | Digit roll animation | Static text swap | P1 |
| Chat message | Slide-in with spring | Full innerHTML rebuild, no entrance | P1 |
| Level badge | Glow on high-level users | Hardcoded `lvl: 2` | P1 |
| VIP entry | Car/dragon mount animation | None | P2 |
| PK countdown | 3-2-1 fullscreen + bass | Client timer text only | P0 |
| PK score update | Bar lerp + particle burst | Instant width jump | P0 |
| PK winner | Crown + confetti + screen flash | None | P0 |
| Wallet debit | Coin fly from balance to gift | None | P1 |
| Recharge success | Coin rain | None | P1 |
| Button press | Scale 0.95 spring | None | P2 |
| Host level up | Full-screen celebration | None | P2 |

### Party / Audio Room (`party-room.html`)

| Interaction | Industry Standard | Current State | Priority |
|-------------|-------------------|---------------|----------|
| Active speaker | Ripple ring + waveform | CSS class exists, rarely applied | P0 |
| Seat join | Seat pulse + avatar pop | None | P0 |
| Raise hand | Hand icon bounce on seat | None | P1 |
| Mic request sent | Pulsing glow on host panel | Toast only | P1 |
| Empty seat tap | Bounce feedback | None | P2 |
| Host crown seat | Persistent glow | Static emoji | P2 |

### Discovery (`explore.html`, `party.html`, `video.html`)

| Interaction | Industry Standard | Current State | Priority |
|-------------|-------------------|---------------|----------|
| Live card | Pulsing LIVE badge + viewer tick | Static card | P1 |
| Card tap | Scale press + navigate | Instant navigation | P2 |
| Pull refresh | Elastic bounce | None | P2 |
| Skeleton load | Shimmer placeholders | Single spinner | P1 |

### Rankings (`rankings.html`)

| Interaction | Industry Standard | Current State | Priority |
|-------------|-------------------|---------------|----------|
| Top 3 podium | Crown spotlight + glow | Flat list | P0 |
| Rank row enter | Staggered slide-in | Static HTML dump | P1 |
| Rank climb | Number roll + highlight | None | P1 |
| Follow button | Heart burst | Text change only | P1 |

### Gifts Sheet (`injectGiftSheet`)

| Interaction | Industry Standard | Current State | Priority |
|-------------|-------------------|---------------|----------|
| Sheet open | Slide up spring | CSS class toggle | P1 |
| Gift select | Scale pulse + preview | Border highlight only | P1 |
| Qty select | Combo preview animation | Active class only | P1 |
| Send | Launch trajectory to stage | None | P0 |

### Wallet (`coins-recharge.html`, top-up sheet)

| Interaction | Industry Standard | Current State | Priority |
|-------------|-------------------|---------------|----------|
| Balance update | Odometer roll | Static text | P1 |
| Purchase success | Coin rain + haptic | None | P1 |
| Insufficient coins | Shake + red flash | Toast only | P1 |

---

## Animation Technology Gap

| Requested | Applicable to this codebase | Status |
|-----------|----------------------------|--------|
| Lottie | Web (`lottie-web` CDN) | **Not integrated** — implementing in `social-fx.js` |
| Reanimated | React Native only | N/A — use CSS `@keyframes` + WAAPI |
| Gesture Handler | React Native only | N/A — use touch events + CSS |
| FlashList | React Native only | N/A — virtual list future work |

**Web equivalent stack:** `lottie-web` + CSS transforms + `requestAnimationFrame` + Vibration API.

---

## Implementation Status (this sprint)

| Module | File | Status |
|--------|------|--------|
| Gift FX engine | `social-fx.js` | ✅ Implementing |
| Combo system | `social-fx.js` | ✅ Implementing |
| Join/leave banners | `social-fx.js` | ✅ Implementing |
| PK visuals | `social-fx.js` + `social-live.js` | ✅ Implementing |
| Speaking waves | `social-fx.css` + Agora volume | ✅ Implementing |
| Coin animations | `social-fx.js` | ✅ Implementing |
| Micro-interactions | `social-fx.css` | ✅ Implementing |
| Rankings polish | `rankings.html` + `social-fx.css` | ✅ Implementing |
