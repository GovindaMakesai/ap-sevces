# Missing Engagement Report — Live Experience Audit

**Date:** 2026-06-12

---

## Why the App Feels Lifeless

Engagement loops require **constant visible activity**. Users on Bigo/TikTok Live always see: join banners, gift flights, chat scroll, score changes, combo counters, and heartbeat indicators. AP Services shows a **static video overlay with dead widgets**.

---

## Missing Engagement Mechanics

### 1. Activity Visibility (Critical)

| Mechanic | Bigo/TikTok | AP Services |
|----------|-------------|-------------|
| Live activity ticker | Scrolling gift/join events | Hidden ticker (`display: none`) |
| Join notifications | Every 3-10 joins shown | None |
| Gift spotlight | Sender name + animation | Small fly banner |
| "X is watching" social proof | Friend avatars in room | Fake random viewer counts on discovery |
| Hour ranking live update | Real rank position | Fabricated `No.50` formula |
| Heat score | Room energy meter | Random team progress bar |

**Fix:** Activity rail fed by real socket events; remove fake `setInterval` team progress.

### 2. Dopamine Loops (Critical)

| Loop | Trigger | Reward | AP Services |
|------|---------|--------|-------------|
| Send gift | Tap send | Animation + combo + chat callout | Toast only |
| Receive gift | Socket event | Host celebration | Banner flash 4s |
| Follow | Tap follow | Heart burst + follower count | localStorage + toast |
| Like | Double-tap video | Floating hearts | **Not implemented** |
| Combo chain | Rapid same-gift | Multiplier + explosion | **Not implemented** |
| Chest open | Timer hits 0 | Coin reward | Timer counts, nothing happens |
| Level up | XP threshold | Full-screen unlock | Static "Lv.2" text |

### 3. Social Energy (High)

| Feature | Status |
|---------|--------|
| Real-time top gifters with crown | Partial — 2 avatars max |
| Fan club badges in chat | Missing |
| @mentions | Missing |
| Reply threading | Missing |
| Welcome message for new joiners | Generic system message only |
| "X followed the host" broadcast | Missing |
| Guest rail with gift counts | Exists but static |

### 4. Competitive Engagement (Critical for PK)

| Feature | Status |
|---------|--------|
| PK invite/accept | Missing |
| Dual video streams | Missing |
| Score sync from gifts | Backend only; frontend fake |
| MVP gifter callout | Missing |
| Last 30s urgency mode | Missing |
| Winner/loser ceremony | Missing |
| Rematch CTA | Missing |

### 5. Retention Hooks

| Hook | Status |
|------|--------|
| Daily login reward animation | Missing |
| Streak counter | Missing |
| "Almost level up" progress nudge | Missing |
| Push on followed host live | Missing |
| Lucky gift roulette | UI only, no probability |

---

## Engagement Fixes Implemented

1. **Activity feed** — scrolling join/gift/follow events from socket
2. **Double-tap like** — floating hearts on live video
3. **Combo system** — x1/x5/x10/x20/x50/x100 with timer and multiplier
4. **Gift spectacle** — tiered animations (small float / premium fullscreen)
5. **PK socket wiring** — real score updates from server
6. **Chest reward** — coin burst when timer completes
7. **Team progress** — tied to gift events, not random interval
8. **Follow celebration** — heart burst + activity entry

---

## Metrics to Track Post-Fix

- Gifts sent per session (target: +40%)
- Average session duration in live room (target: 3min → 8min)
- Follow conversion rate (target: 5% → 15%)
- Combo gift rate (target: 0% → 20% of gifts)
