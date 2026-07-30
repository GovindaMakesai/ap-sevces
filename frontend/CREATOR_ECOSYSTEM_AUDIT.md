# AP Live — Creator Ecosystem Overhaul  
## Audit + Implementation Progress (Production MPA)

**Date:** 2026-07-30  
**Branch:** `main` (production)  
**Scope:** `frontend/`, `backend/` — **ignore `frontend/spa/`**  
**Status:** Phase 1 complete · **Creator Experience Phase 2 in progress**  
**Constraints:** Keep cream/gold, nav, layouts, branding. No Instagram/TikTok clone. No SPA migration. No Expo/AAB.

---

## Phase 2 locked defaults

| Topic | Decision |
|-------|----------|
| Bio | Free text, sanitized, max 280 |
| Social links | Instagram / YouTube / X / Website with URL validation |
| Creator level | Reuse VIP membership + creator badges; UI plug-in ready |
| Featured video | Auto top public video (engagement × recency); `featured_post_id` for manual pin later |
| Discovery rails | Live Now · Trending · New Creators · Because You Follow |
| Analytics | Derived from posts/gifts/follows/lives; no event pipeline yet |
| Reel viewer | Premium polish, **no layout redesign** |

---

## Completed — Phase 1

- Posts-by-user API, ranked For You / Following / Latest, blocks, comments/delete/share, profile tabs, demo removal, reels ±1 preload, LIVE pills, indexes, media abstraction.

---

## Completed — Phase 2 (this pass)

### Premium Reel Viewer
- [x] Scroll containment + slide `contain` for fewer paints
- [x] Fade-in when video `canplay` / active slide
- [x] Double-tap heart (SocialFX or inline burst) → like
- [x] Background/resume: pause on hide, restore + play on visible
- [x] Memory: detach `src` beyond ±1; warm ±2 posters only
- [x] Buffer spinner polish

### Engagement
- [x] Like pop + in-flight lock (Phase 1) kept
- [x] Follow button pop animation via identity module
- [x] Comment sheet slide transition CSS
- [x] Optimistic follow with rollback

### Creator identity
- [x] `social-creator-identity.js` — avatar, verified, role, agency, level, LIVE
- [x] Wired on Square cards + reel name row + profiles

### Discovery
- [x] `GET /api/social/discover/rails`
- [x] Lightweight rails on Video + Square (`social-discovery-rails.js`)

### Profiles
- [x] `users.bio`, `social_links`, `featured_post_id` via `ensureCreatorProfileSchema`
- [x] Engagement payload: bio, links, VIP/badge, featured video, live hours
- [x] Own-profile “Edit bio & links”

### Analytics
- [x] `GET /api/social/creators/:userId/analytics` (self only)
- [x] Streamer Center “Content analytics” panel (likes/comments/shares/followers/posts/gifts/live hours + top content)
- [x] `eventsSupported: false` extension flag for future watch-time

---

## Remaining / next polish

| Item | Notes |
|------|--------|
| Perf instrumentation HUD | Optional debug overlay for FPS / TTFV on A51 |
| Infinite scroll | API ready; not yet client infinite |
| Manual featured pin UI | Column ready; edit prompt can set `featured_post_id` later |
| Richer bio editor | Prompt-based MVP; replace with sheet when needed |
| Impression/watch-time events | Service shape ready — do not build pipeline yet |

---

## Key APIs (Phase 2)

```
GET  /api/social/discover/rails?limit=
GET  /api/social/creators/:userId/engagement  (+ bio, socialLinks, featuredVideo, vipLevel, creatorLevel)
GET  /api/social/creators/:userId/analytics?period=today|week|month
PUT  /api/auth/profile  { bio, social_links, featured_post_id }
```

---

## Regression checklist (Phase 2)

1. Video: double-tap heart likes + burst; single tap still play/pause  
2. Background app → return: active reel resumes without flash  
3. Scroll far: only nearby videos have `src`  
4. Square/Video show Live Now / Trending rails when data exists  
5. Profile shows bio/links/featured; own profile can edit  
6. Streamer Center analytics matches period toggles  
7. Same creator badges identical on Square card vs profile  
8. A51: no obvious decode thrash when flinging reels  

---

## Files (Phase 2 primary)

**Backend:** `ensureCreatorProfileSchema.js`, `creatorProfileSanitize.js`, `creatorDiscoveryService.js`, `creatorAnalyticsService.js`, `discoverCreatorService.js`, `User.js`, `userDto.js`, `authController.js`, `socialController.js`, `routes/social.js`, `server.js`  

**Frontend:** `social-creator-identity.js`, `social-discovery-rails.js`, `social-interactions.js`, `social-features.css`, `video.html`, `square.html`, `creator-profile.html`, `streamer-center.html`
