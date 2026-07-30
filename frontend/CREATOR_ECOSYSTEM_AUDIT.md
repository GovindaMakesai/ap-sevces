# AP Live — Creator Ecosystem Overhaul  
## Audit + Implementation Progress (Production MPA)

**Date:** 2026-07-30  
**Branch:** `main` (production)  
**Scope:** `frontend/`, `backend/` — **ignore `frontend/spa/`**  
**Status:** Implementation in progress (Phases 1–9)  
**Constraints:** Keep cream/gold, nav, layouts, branding. No Instagram/TikTok clone. No SPA migration. No Expo/AAB.

---

## Locked product decisions

| Topic | Decision |
|-------|----------|
| Media | Single photo OR video; carousel-ready `media_items` shape |
| Trim | Playback markers only (no server export) |
| Storage | Local `/uploads/social` via `socialMediaUrl.js` (CDN-ready) |
| Private posts | Owner-only |
| Profile tabs | Posts \| Videos |
| Agency | Badge/name when creator belongs to agency |
| Feed default | **For You** (ranked) + Following + Latest |
| Ranking | Configurable weights in `socialFeedRanking.js` |
| Blocks | Always excluded from feeds / discover / recommendations |
| Realtime | Optimistic + soft refresh; `SocialRealtime` hook for Socket.IO later |
| Bookmarks | Out of scope (`bookmarkPost` stub only) |
| LIVE badge | Deep-link to live **or** party room (host or on seat) |
| Demo content | Removed from production Square empty state |
| Topics | Left as-is + `SocialTopicsProvider` swap point |
| Schema | `ensureSocialPostsSchema` indexes only (non-destructive) |

---

## Completed

### Backend
- [x] `GET /api/social/posts` supports `userId`, `feed=for_you|following|latest`, `mediaType`, `limit`/`offset`
- [x] optionalAuth on list posts (public creator profiles)
- [x] Batch enrich (no N+1 per post for likes/comments/authors)
- [x] Blocked-user exclusion in feed
- [x] Ranking weights: `backend/config/socialFeedRanking.js`
- [x] Media abstraction: `backend/services/socialMediaUrl.js` (`media_items` array)
- [x] Indexes on `user_id`, visibility, media_type, likes/comments
- [x] Safe like `ON CONFLICT (post_id, user_id)`
- [x] Comments pagination (`limit`/`offset`)
- [x] Creator engagement: posts/videos counts, agency, LIVE (host **or** party seat)
- [x] Discover: block filter + agency + party LIVE
- [x] Feed attaches `author_live` for pills

### Frontend
- [x] Creator profile loads posts/videos from API by `userId` (Posts \| Videos tabs)
- [x] Agency badge; LIVE banner → live/party room
- [x] Comments / delete / share wired to APIs
- [x] Demo/fake Square posts removed; real empty states
- [x] For You / Following / Latest on Square + Video
- [x] Relative timestamps; hashtag styling; like pop + in-flight lock
- [x] Reels: `src` only for active ±1; soft refresh; buffering indicator
- [x] LIVE pills on Square/Video author rows
- [x] Profile tab → “My posts & videos”
- [x] UUID-first profile links / follow keys where available
- [x] `SocialRealtime` + `bookmarkPost` extension points
- [x] Topics: `SocialTopicsProvider` extension (content unchanged)

---

## Remaining / follow-ups

| Item | Notes |
|------|--------|
| Infinite scroll pagination | API ready; client still loads first page (limit 30–40) |
| CDN migration | Set `PUBLIC_MEDIA_BASE` / `CDN_BASE_URL` when ready |
| Multi-image carousel | Use `media_items`; schema JSONB optional later |
| Socket.IO engagement | Plug into `SocialRealtime.subscribe/emit` |
| Bookmarks | Stub only |
| Server-side trim export | Explicitly out of scope |

---

## Key APIs

```
GET  /api/social/posts?feed=for_you|following|latest&userId=&mediaType=video|posts|all&limit=&offset=
GET  /api/social/posts/:id/comments?limit=&offset=
POST /api/social/posts/:id/comments
POST /api/social/posts/:id/like
POST /api/social/posts/:id/share
DELETE /api/social/posts/:id
GET  /api/social/creators/:userId/engagement  (+ postsCount, videosCount, agency*, liveHref)
```

---

## DB (ensureSocialPostsSchema)

- Columns: `thumb_url`, `media_type`, `visibility` (existing)
- Indexes: `idx_social_posts_user_created`, `visibility_created`, `media_type_created`, likes/comments post indexes

---

## Regression checklist

1. Upload photo/video → appears on own creator profile (other device) under correct tab  
2. Private post visible only to owner  
3. Square empty state has no demo cards  
4. For You / Following / Latest switch without full app reload  
5. Blocked users absent from Square, Video, Discover  
6. LIVE pill opens correct live or party room  
7. Like / comment / delete sync across devices  
8. Reels do not attach every video `src` at once  

---

## Files touched (primary)

**Backend:** `socialFeedService.js`, `socialMediaUrl.js`, `socialFeedRanking.js`, `ensureSocialPostsSchema.js`, `discoverCreatorService.js`, `socialController.js`, `routes/social.js`  

**Frontend:** `social-interactions.js`, `creator-profile.html`, `square.html`, `video.html`, `profile-tab.html`, `social-features.css`, `social-shell.js`
