# Live Experience Overhaul — Documentation Index

**Date:** 2026-06-12

## Audit Reports

1. [Missing Animations](./01-missing-animations.md)
2. [Missing Engagement](./02-missing-engagement.md)
3. [Missing Monetization](./03-missing-monetization.md)
4. [Missing Social Features](./04-missing-social-features.md)
5. [UI Redesign Plan](./05-ui-redesign-plan.md)
6. [Component Implementation Plan](./06-component-implementation-plan.md)

## Implementation (Production Code)

| File | Purpose |
|------|---------|
| `frontend/social-fx.js` | Animation & engagement engine |
| `frontend/social-fx.css` | FX styles, design tokens, micro-interactions |
| `frontend/social-live.js` | Integrated hooks (gifts, PK, room, audio) |
| `frontend/live-room.html` | Loads FX modules |
| `frontend/party-room.html` | Loads FX modules |
| `frontend/rankings.html` | Podium + follow burst |

## Stack Note

This is a **vanilla web** app. React Native Reanimated / FlashList do not apply. Equivalents:

- **Lottie** → `lottie-web` (CDN, premium gifts)
- **Reanimated** → CSS `@keyframes` + `requestAnimationFrame`
- **Gesture Handler** → touch events (double-tap like)
- **Socket.IO** → already used, PK events now wired

## Quick Test

1. Open live room while logged in
2. Double-tap video → floating hearts
3. Send a rose → floating animation
4. Send Lion King / Yacht tier gift → fullscreen + shake
5. Rapid sends → combo badge x10+
6. Follow host → heart burst
7. Party room → mic on → speaking ring on host seat
8. `?pk=1` → countdown animation
