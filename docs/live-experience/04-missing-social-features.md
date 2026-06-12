# Missing Social Features Report — Live Experience Audit

**Date:** 2026-06-12

---

## Critical: Social Graph is Fake

| Feature | Expected | Actual |
|---------|----------|--------|
| Follow/unfollow | Server-persisted | `localStorage` only |
| Follower count | Global truth | Device-local |
| Follow feed | Live notifications | None |
| Block user | Server list | None |
| Mutual follow | Friend state | None |

---

## Module Gaps

### Live Room Social

| Feature | Status |
|---------|--------|
| Follow with animation | Toast only → **fixing** |
| Share with preview card | URL copy only |
| @mention in chat | Missing |
| User level in chat | Hardcoded 2 |
| VIP badge | Missing |
| Fan badge | Missing |
| Moderator kick/block | Missing |
| Pin comment | Missing |
| Report (real) | Toast stub |

### Audio Room Social

| Feature | Status |
|---------|--------|
| Seat-based identity | UI only |
| Speaking indicator | Cosmetic → **fixing with Agora volume** |
| Raise hand queue | Missing |
| Host invite to seat | Accept/deny only |
| Room rules acknowledgment | Modal once |

### Profile Social

| Feature | Status |
|---------|--------|
| Gift wall | Static |
| PK record | Missing |
| Live hours | Missing |
| Host level XP | Static |
| Verification badge | Backend exists, minimal UI |
| Creator vs viewer profile | Partial |

### Chat Social (DM)

| Feature | Status |
|---------|--------|
| Text + images | ✅ Works |
| Video/voice call | Demo stub |
| Typing indicator | UI only |
| Online status | Missing |

---

## Competitive Social Features Not Started

1. Fan club (paid membership per host)
2. Guardian/top gifter permanent badge
3. Family/agency team rooms
4. Cross-room gift migration during PK
5. "Friends watching" on discovery cards
6. Go-live push to followers (FCM)
7. In-room user list drawer with follow buttons

---

## Fixes in This Sprint (Frontend)

- Follow heart burst animation
- Level badge rendering from user XP heuristic
- VIP glow for high spenders in session
- Activity feed showing social events
- Join/leave banners with avatars
- Profile sheet badge row animated
- Rankings follow button micro-interaction

## Requires Backend (Next Phase)

- `POST /social/follow/:userId`
- `GET /social/followers/:userId`
- Block list API
- FCM go-live notifications
