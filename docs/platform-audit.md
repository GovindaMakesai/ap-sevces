# Platform Audit — AP Services Live Streaming

**Audit date:** 2026-06-12  
**Scope:** Full-stack audit of live streaming, social audio, PK, gifts, chat, wallet, followers, profiles  
**Auditor stance:** Brutally critical — this report identifies every flaw preventing the app from feeling like a production live-streaming platform (Bigo, MICO, Tango, TikTok Live, Chamet class).

---

## Executive Summary

AP Services is a **dual-identity application**: a legitimate services marketplace (bookings, workers, payments) with a **cosmetic live-social layer** bolted on top. The wallet and gift ledger on the backend are the most production-grade components. Everything users *see and feel* in live rooms — PK battles, rankings, followers, gift spectacles, party audio dynamics, discovery feeds — is largely **client-side theater**, partially wired, or disconnected from server truth.

**Honest production readiness for live streaming: ~25–35%**  
*(The prior internal audit claiming 72% reflects backend schema presence, not end-user experience quality.)*

| Layer | Grade | One-line verdict |
|-------|-------|------------------|
| Wallet / gifts (backend) | B+ | Real PostgreSQL transactions, fees, commissions |
| Live room persistence | C+ | DB-backed but authority model is broken |
| RTC (Agora) | C | Works when configured; silent mock mode otherwise |
| PK battle | F | Backend exists; frontend never connects; UI is fake |
| Audio party room | D | 9-seat UI; no real per-seat audio state |
| Chat (live) | C- | Socket works; no moderation, mentions, or spectacle |
| Chat (DM) | B- | Real API; calls are demo |
| Followers / social graph | F | 100% localStorage fiction |
| Discovery / rankings | F | Hardcoded and random data |
| UI/UX | D | High-fidelity clone skin; cluttered, inconsistent |
| Security | D | Critical host-trust and OAuth escalation bugs |
| Scalability | D | Single-process sockets; Redis underused |

---

## 1. Architecture Issues

### 1.1 Split-brain data layer

| Store | Intended | Actual |
|-------|----------|--------|
| PostgreSQL | Marketplace + economy | **Source of truth** for wallets, live rooms, gifts, PK, chat DMs |
| MongoDB | Unknown | Connected optionally; `Conversation.js` and `Message.js` **never imported** |
| Supabase | Unknown | Config exists; **zero runtime usage** |
| Redis | Cache + scaling | Optional; leaderboard + fraud counters only |
| localStorage (frontend) | UI prefs | **Follows, posts, likes, comments, reel stats** |

The codebase advertises MongoDB in docs and connects on boot, but all live/chat persistence goes through PostgreSQL. MongoDB is abandoned scaffolding — a maintenance liability and source of confusion for any engineer onboarding.

### 1.2 Monolithic frontend with no module boundaries

`social-live.js` (~2,300 lines) owns Agora, Socket.IO, gifts, PK overlay, party seats, feed swiping, chat rendering, and UI injection. There is no bundler, no TypeScript, no separation of concerns. This is unmaintainable for a platform targeting 60 FPS animations and sub-100ms socket latency.

### 1.3 Three socket handlers on one connection

`chatSocket.js`, `liveSocket.js`, and `pkSocket.js` each register `io.on('connection')` on the default namespace. No `/live`, `/chat`, or `/pk` namespaces. Chat, live, and PK events share one pipe — fragile at scale and hard to isolate failures.

### 1.4 No horizontal scaling path wired

- `@socket.io/redis-adapter` is documented as TODO but **not installed or wired**
- Rate limits are in-memory per socket process
- `liveRoomService.roomCache` Map is written but **never read** — every operation hits PostgreSQL
- Multi-instance deployment will produce split-brain rooms (users in same channel on different servers won't see each other)

### 1.5 Marketplace + live social are not unified

Workers from `/api/workers` are displayed as "live streamers" with **random viewer counts** (`100 + Math.random() * 4000`). A home-services electrician and a Bigo-style host share the same card component. There is no `creators` or `live_sessions` domain — live identity is inferred from worker profiles.

### 1.6 REST vs Socket responsibility gap

Live room join, chat, gifts, seat management, and room end are **Socket-only**. There are no REST fallbacks for mobile backgrounding, reconnect hydration, or third-party integrations. `GET /api/live/rooms` lists rooms but provides no join contract.

---

## 2. UI Issues

### 2.1 Visual clutter and reference-theme stacking

`social-live.css` (~2,168 lines) stacks multiple design languages: TikTok-style vertical feed, Bigo-style gift bar, generic gold gradients, duplicate bottom-bar blocks (`party-widgets-live`, `ap-bottom-ref`). The result feels like **screenshots of different apps layered together**, not one premium product.

### 2.2 Inconsistent monetization presentation

| Surface | Currency shown |
|---------|----------------|
| `coins-recharge.html` | INR (UPI QR) |
| Live room top-up sheet | USD ($0.99–$200) |
| Gift catalog | Abstract "coins" up to 1,500,000 |
| Store | Browse-only; no purchase |

Users cannot trust what anything costs.

### 2.3 Decorative widgets presented as real

| Widget | Location | Reality |
|--------|----------|---------|
| Hour ranking `No.50` | Live room stats bar | Template string, not server rank |
| Popularity `64.17%` | Stats bar | Formula from viewer count |
| Music score `14` | Stats bar | Hardcoded HTML, never updated |
| Team progress bar | Party widgets | `setInterval` + random increment every 15s |
| Treasure chest timer | Party widgets | Client countdown from 294s |
| PK badge on cards | `social-shell.js` | Says "AP LIVE", not PK — misleading |
| Chat unread badge | Bottom nav | Defaults to `2` from localStorage |

### 2.4 No skeleton loaders or optimistic hierarchy

Grids show a spinner then dump content. Live room loads 7 scripts with no code splitting. No progressive enhancement for video area (black screen until Agora connects).

### 2.5 Typography and spacing

Mixed font stacks (system, Arial in SVG avatars, Font Awesome icons as primary navigation). Bottom bar is pinned to `document.body` via `pinBottomBarToBody()` — fragile z-index wars on mobile WebViews.

### 2.6 Marketing vs implementation mismatch

- `party.html` advertises **"Up to 25 seats"** — code implements **9 seats**
- Live application page has `authOk = true`, `levelOk = true` hardcoded — no real gating
- Filter chips (India, Nepal) only toggle CSS; "Global" navigates to services marketplace

---

## 3. UX Issues

### 3.1 Users can enter rooms that don't exist

When `/live/rooms` returns fewer than 8 items, `social-live.js` injects `mock: true` feed rooms. Users swipe into channels with **no server room**, then gifts/chat/Agora fail with cryptic errors. This is the single worst UX failure — it trains users that the app is fake.

### 3.2 Silent "preview mode" when not actually live

If Agora credentials are missing or token fails, the host sees their own camera with message *"Preview mode — only you see this stream"*. Nothing blocks "Go Live." Hosts believe they are broadcasting; viewers see nothing.

### 3.3 Login wall with no teaser

Live requires auth; unauthenticated users get redirected after 800ms with no preview of the stream. Real platforms show blurred preview + CTA.

### 3.4 PK mode is a lie

`?pk=1` shows a split-screen overlay with **random initial scores** and a client timer. Gifts only increment the left score. No opponent stream, no invite flow, no winner state. Users who know Bigo/MICO will immediately dismiss the app as a scam clone.

### 3.5 Follow button gives false social proof

Tapping Follow updates localStorage. Follower counts on profiles are **device-local fiction**. Following someone on phone A does not exist on phone B. Creator profiles key follows by **display name string**, not user ID — name collisions break the graph.

### 3.6 Dead interactions

| Control | Behavior |
|---------|----------|
| Party search input | No handler |
| Report button | Toast: "Report submitted" |
| Effects button | Toast only |
| Minimize button | Toast only |
| Lucky gift "Receive" | Toast only |
| Store purchase | Opens recharge QR only |
| Video/voice call in DM chat | Labeled "(demo)" — no WebRTC |
| Region tabs in live chat | CSS toggle only; no scope change |

### 3.7 Feed swipe tears down entire session

Vertical feed mode (`?feed=1`) calls Agora leave + socket leave on every swipe. Correct for isolation but **heavy** — causes visible jank, re-buffering, and chat loss. No pre-warming of adjacent rooms.

### 3.8 No connection recovery UX

Live socket has no reconnection/backoff (unlike DM chat which has `reconnectionAttempts: 8`). Network blip = stuck room state.

---

## 4. State Management Issues

### 4.1 No single source of truth

| Domain | State location | Authoritative? |
|--------|----------------|----------------|
| Auth / token | `app.js` AppState + localStorage | Server JWT |
| Wallet balance | `social-wallet.js` 4s memory cache | Server |
| Live room | ~20 module-level `let` in `social-live.js` | Should be server; host flag is client |
| Follows | localStorage `social_follows` | **Client only** |
| Posts / likes | localStorage + IndexedDB | **Client only** |
| Chat (DM) | `useChatStore` pub/sub in `chat.html` | Server + socket |
| PK scores | Client variables | **Client only** |

### 4.2 Full DOM rebuild on every update

`renderChatFeed()`, `renderPartySeats()`, `renderTopGifters()` clear `innerHTML` and rebuild. At scale this causes layout thrash and loses scroll position/focus.

### 4.3 Timer leaks

Team progress and chest timers use `setInterval` without guaranteed cleanup on room exit.

### 4.4 Duplicate event bindings

`partyBtnFollow` is bound twice in `bindCommonControls()`.

### 4.5 Best pattern exists but wasn't replicated

`useChatStore` in `chat.html` is a clean pub/sub store. Live room ignored this pattern entirely.

---

## 5. API Issues

### 5.1 `platformController` uses wrong request property

```javascript
// platformController.js uses req.user.userId everywhere
// auth middleware sets req.userId — NOT req.user.userId
```

**Impact:** `/api/v1/*` endpoints (agencies, contests, VIP, rewards, payments, verification) are likely broken or operating on `undefined` user IDs.

### 5.2 No live room REST API

Missing endpoints for:
- Create/start live session
- End session
- Get room snapshot (for reconnect)
- List room members with roles
- Moderation actions (kick, block, pin)
- Co-host invite

Everything depends on Socket.IO events that are undocumented in OpenAPI/Swagger.

### 5.3 Gift catalog not served by API

40+ gifts hardcoded in `social-live.js` with prices up to 1.5M coins. Backend `giftService` accepts arbitrary `gift_type` and `coin_amount` from client — **price authority is on the client**.

### 5.4 No followers API

Zero endpoints for follow/unfollow, follower list, or follow feed. Social graph does not exist server-side.

### 5.5 Workers API misused as live discovery

`GET /workers` returns marketplace professionals, not active live hosts. Viewer counts are fabricated client-side.

### 5.6 Public Agora config endpoint

`GET /api/live/agora/config` requires no auth. Acceptable for RTC app IDs, but combined with weak host auth allows token farming for any channel name.

---

## 6. Socket Issues

### 6.1 Client-declared host authority (CRITICAL)

```javascript
// liveSocket.js
const isHost = Boolean(payload?.isHost);
socket.data.isHost = isHost;
```

`live:end`, `live:seat_response`, `live:mute`, and `pk:end` trust `socket.data.isHost` — **not** `live_rooms.host_user_id`. Any user with `live.host` permission can end any room. Last joiner with `isHost: true` can overwrite host via `hostRoom()` UPDATE.

### 6.2 PK socket disconnected from frontend

Backend emits: `pk:start`, `pk:join`, `pk:score`, `pk:end`  
Frontend grep result: **zero listeners** for any `pk:*` event.

The entire server-side PK engine is orphaned.

### 6.3 `pk:score` is a no-op

```javascript
// pkSocket.js — pk:score handler only re-fetches and rebroadcasts
// It does NOT mutate scores. Scores only change via giftService → addGiftScore
```

Misleading event name; manual score sync impossible.

### 6.4 Viewer count inflation

Count = DB members, not unique socket connections. One user with 3 tabs = 3 viewers. No deduplication by `userId`.

### 6.5 Rate limits are per-process

Chat: 20/10s, Gifts: 15/10s — in-memory per socket. Useless across multiple server instances.

### 6.6 JWT in query string

`socket.handshake.query?.token` accepted — tokens leak via proxy logs, browser history, Referer headers.

### 6.7 No socket event versioning

Payload shapes are implicit. Frontend and backend can drift silently (already happened with PK).

### 6.8 Dual socket connections

Opening live room + DM chat = two independent Socket.IO connections. No shared connection manager.

---

## 7. Database Issues

### 7.1 PostgreSQL schema is solid for economy; thin for social

**Well-designed tables:** `wallets`, `wallet_transactions`, `gift_transactions`, `recharges`, `withdrawals`, `pk_battles`, `pk_participants`, `pk_scores`, RBAC tables.

**Missing tables:**
- `user_follows` / social graph
- `user_blocks` / moderation
- `gift_catalog` (server-side pricing)
- `live_room_moderators`
- `pinned_messages`
- `stream_categories`
- `co_host_invitations`
- `mic_requests` (structured, not just events log)
- `notification_tokens` (FCM)
- `gift_animation_assets`

### 7.2 Live events log is a junk drawer

`live_room_events` stores chat, joins, gifts, seat events as JSONB rows. No indexing strategy for chat history pagination at scale. No TTL/archival policy.

### 7.3 MongoDB models are dead code

`backend/models/Conversation.js` and `Message.js` (Mongoose) — never imported. Chat uses PostgreSQL `conversations` + `chat_messages`.

### 7.4 No read replicas or partitioning plan

Leaderboard queries cached 5 minutes — acceptable. Live chat writes hit primary on every message — bottleneck above ~500 active rooms.

---

## 8. Performance Issues

| Target (user requirement) | Current reality |
|---------------------------|-----------------|
| <100ms socket latency | Unmeasured; DB permission check per socket event adds latency |
| <2s screen load | 7 scripts + 2,168-line CSS + CDN Socket.IO + dynamic Agora load |
| 60 FPS animations | No gift animations; CSS transitions only; full DOM rebuilds |
| Optimized renders | None — vanilla innerHTML clears |

### Specific bottlenecks

1. **Permission DB query on every socket event** — no Redis cache of user permissions
2. **No virtual list for chat** — O(n) DOM nodes for n messages
3. **Agora leave/join per feed swipe** — 500ms–2s disruption per room change
4. **Console logging on every API request** in `app.js` (`📡 API Request`)
5. **IndexedDB + localStorage growth** for social posts (comments unbounded per post)
6. **`social-live.css` loaded whole** — no critical CSS extraction
7. **No CDN for static assets** beyond third-party scripts

---

## 9. Security Issues

### Severity matrix

| Issue | Severity | Location |
|-------|----------|----------|
| OAuth `?role=admin` escalation | **CRITICAL** | `authController.normalizeRequestedRole` accepts `admin` |
| Client-trusted `isHost` | **CRITICAL** | `liveSocket.js` |
| Room hijack via `hostRoom()` UPDATE | **CRITICAL** | `liveRoomService.js` |
| `platformController` undefined userId | **HIGH** | `platformController.js` |
| Hardcoded test OTP bypass | **HIGH** | `TEST_PHONE_OTP_MAP`, `UNIVERSAL_FALLBACK_OTP = '111111'` |
| Client-side gift pricing | **HIGH** | `social-live.js` → `live:gift` |
| Fraud flags don't block | **MEDIUM** | `fraudService` flags; `giftService` continues |
| CORS allows `file://` and LAN IPs | **MEDIUM** | `server.js` |
| PostgreSQL `rejectUnauthorized: false` | **MEDIUM** | `database.js` |
| JWT in socket query string | **MEDIUM** | `liveSocket.js`, `chatSocket.js` |
| No CSRF on state-changing REST | **LOW** | JWT in header mitigates for API clients |

---

## 10. Missing Features (vs stated product objective)

### Video Live Room
| Feature | Status |
|---------|--------|
| Start/end live | Partial — socket only, weak host auth |
| Camera switch | Missing |
| Beauty filters | Missing (button → toast) |
| Stream title | Partial — stored in DB, minimal UI |
| Category selection | Missing |
| Co-host invitation | Missing |
| Block/kick users | Missing |
| Mute users | Partial — DB field, weak auth |
| Pin comments | Missing |
| Join/leave animations | Missing |
| Stream quality monitor | Missing |
| Connection recovery | Missing |

### Audio Room
| Feature | Status |
|---------|--------|
| Host/co-host/audience seats | UI only (9 seats) |
| Mic requests | Partial — socket events exist |
| Raise hand | Missing |
| Speaking indicators | Cosmetic — not tied to Agora volume |
| Seat locking | Missing |
| Room permissions | Missing |

### PK Battle
| Feature | Status |
|---------|--------|
| Challenge/accept flow | Missing |
| Dual video streams | Missing |
| Server-synced scores | Backend only; frontend fake |
| Winner announcement | Missing |
| Punishment round | Missing |
| Celebration animations | Missing |

### Gifts
| Feature | Status |
|---------|--------|
| Server catalog | Missing |
| Combo gifts | Missing |
| Lucky gifts (real) | UI only |
| Global gifts | Missing |
| Gift animations (SVGA/Lottie) | Missing |
| Weekly ranking (real) | Hardcoded data |

### Chat
| Feature | Status |
|---------|--------|
| Reactions | Missing |
| Mentions | Missing |
| Reply threading | Missing |
| Moderation tools | Missing |
| Message deletion | Missing |
| Anti-spam (server) | Rate limit only |

### Wallet
| Feature | Status |
|---------|--------|
| Coins/diamonds | Coins yes; diamonds (`star_balance`) unused in UI |
| Transactions | Yes |
| Gift earnings | Yes (backend) |
| Withdrawals | Yes |
| Revenue tracking (creator) | Partial — no creator dashboard for live earnings |

### Followers
| Feature | Status |
|---------|--------|
| Follow/unfollow API | **Missing** |
| Follower notifications | Missing |
| Follow feed | Missing |

---

## 11. Fake Implementations (complete inventory)

| Component | File(s) | What's fake |
|-----------|---------|-------------|
| PK battle overlay | `social-live.js` | Random scores, client timer, no opponent |
| PK socket integration | `social-live.js` | No `pk:*` listeners at all |
| Follow system | `social-interactions.js` | localStorage only |
| Rankings page | `rankings.html` | `RANK_DATA` hardcoded object |
| Lucky gift leaderboard | `social-live.js` | `LUCKY_RANKS` hardcoded |
| Store purchases | `store.html` | `ITEMS` array; no buy API |
| Discovery viewer counts | `social-shell.js` | `Math.random()` |
| Mock live cards | `social-shell.js` | `mockPros()` fallback names |
| Mock feed rooms | `social-live.js` | `mock: true` injection |
| Team progress widget | `social-live.js` | Random interval updates |
| Chest timer | `social-live.js` | Client-only countdown |
| Hour/popularity stats | `social-live.js` | Fabricated strings |
| Reel/post gifts | `social-interactions.js` | Toast only, no debit |
| DM video/voice calls | `chat.html` | Demo UI, no WebRTC |
| Hourly creator rewards | `rewardEngineService.js` | Returns stub note, credits nothing |
| Live room Redis cache | `liveRoomService.js` | Map written, never read |
| MongoDB chat | `models/Conversation.js` | Never used |
| Supabase | `config/supabase.js` | Never used |
| Chat nav badge | `social-shell.js` | Default unread count of 2 |
| Profile points stat | `profile-tab.html` | Shows `coin_balance` as "Points" |

---

## 12. Hardcoded Values

| Value | Location | Risk |
|-------|----------|------|
| `GIFT_CATALOG` (40+ items, prices) | `social-live.js` | Client price manipulation |
| `QUICK_CHIPS` chat shortcuts | `social-live.js` | Low |
| `socketBase()` fallback URL | `social-live.js` | `https://ap-sevces.onrender.com/api` |
| `TEST_PHONE_OTP_MAP` | `authController.js` | Auth bypass |
| `UNIVERSAL_FALLBACK_OTP = '111111'` | `authController.js` | Auth bypass |
| `DEFAULT_SETTINGS` 20% fee, 500 min withdrawal | `walletService.js` | Business logic (acceptable if admin-configurable) |
| Platform treasury email/phone | `platformService.js` | Internal |
| OAuth callback URLs | `routes/auth.js` | Deployment coupling |
| CORS allowlist | `server.js` | Deployment coupling |
| `pkTimerSec = 188` | `social-live.js` | Fake PK |
| `chestSec = 294` | `social-live.js` | Fake widget |
| Agora channel default `'ap-party'` | `liveController.js` | Low |
| `chat_unread` default `2` | `social-shell.js` | Misleading UX |
| Demo user names in `mockPros` | `social-shell.js` | Fake discovery |

---

## 13. Non-Functional Components

1. **PK battle** — visual overlay only  
2. **Party search** — input with no JS handler  
3. **Region filter tabs** — CSS only  
4. **Report / Effects / Minimize** — toast stubs  
5. **Store buy flow** — redirects to recharge  
6. **Google Pay button** in top-up sheet — no handler  
7. **Filter chips** (India, Nepal) — non-functional  
8. **Platform v1 APIs** — likely broken (`req.user.userId`)  
9. **Hourly reward cron** — runs but does nothing  
10. **MongoDB layer** — connects, does nothing  
11. **Supabase integration** — dead  
12. **Speaking indicators** — not connected to Agora `volume-indicator`  
13. **Co-host / camera switch / beauty** — not implemented  

---

## 14. Poor User Flows

### Flow: Discover → Watch Live
1. User opens `party.html` → sees grid of workers with fake viewer counts  
2. Taps card → `party-room.html?channel=...`  
3. Must be logged in or redirected  
4. If channel doesn't exist server-side, join fails silently or with cryptic error  
5. **Expected:** Active live sessions with real thumbnails, viewer counts, category filters  

### Flow: Go Live (Video)
1. User opens `live-room.html?host=1`  
2. Agora may fail → preview mode with no blocking  
3. User declares `isHost: true` via socket — server doesn't verify ownership  
4. **Expected:** Pre-flight checks (camera, mic, network), category/title setup, "You're live" confirmation with viewer join events  

### Flow: Send Gift
1. User opens gift sheet (hardcoded catalog)  
2. Selects 1.5M coin gift (may exceed balance)  
3. Socket sends gift → backend debits (real)  
4. Animation: 4.5s CSS fly banner — no spectacle  
5. **Expected:** Balance check UI, combo multiplier, full-screen SVGA, sender spotlight  

### Flow: PK Battle
1. User adds `?pk=1` to URL  
2. Fake scores appear  
3. Gifts increment left side only  
4. Timer counts down client-side  
5. No winner, no punishment, no second stream  
6. **Expected:** Invite → accept → split screen → synchronized scores → winner animation  

### Flow: Follow Creator
1. Tap Follow → localStorage updated  
2. Follower count increments locally  
3. Other devices / users don't see it  
4. **Expected:** Persistent social graph, notifications, follow feed  

---

## 15. Technical Debt

| Debt item | Effort | Impact if unfixed |
|-----------|--------|-------------------|
| Delete or wire MongoDB/Supabase | Low | Engineer confusion |
| Fix `platformController` req.userId | Low | Phase 2 APIs broken |
| Server-side host verification | Medium | Room hijacking |
| Remove mock room injection | Low | User trust |
| Wire frontend PK to backend PK socket | High | Core feature missing |
| Extract `social-live.js` into modules | High | Unmaintainable |
| Add `@socket.io/redis-adapter` | Medium | Can't scale |
| Server-side gift catalog + price validation | Medium | Revenue loss |
| Follow API + migration from localStorage | Medium | Social features fake |
| Gift animation pipeline (SVGA/Lottie) | High | Premium feel |
| Remove OAuth admin escalation | Low | Security breach |
| Add OpenAPI documentation | Medium | Integration friction |
| Test suite (currently ~5 trivial tests) | High | Regression risk |
| Unify INR/USD monetization UX | Low | User confusion |
| Capacitor/React Native app parity | High | Mobile experience |

---

## 16. What Actually Works (credit where due)

1. **Wallet transactions** — atomic PostgreSQL with `FOR UPDATE` locks  
2. **Gift debit pipeline** — sender debit → receiver credit → platform fee → agency commission → leaderboard → charity → PK score (backend chain)  
3. **Withdrawal/recharge flows** — manual admin verification wired  
4. **DM chat** — PostgreSQL persistence + socket push; best frontend state pattern  
5. **RBAC permission system** — DB-resolved roles and permissions (when called correctly)  
6. **Agora integration skeleton** — token endpoint, host/audience roles, audio/video modes  
7. **Live room DB persistence** — rooms, members, events survive server restart  
8. **PK battle service** — DB schema and gift-score sync exist (frontend doesn't use it)  
9. **Cron scheduler** — idle room cleanup, contest expiry, leaderboard refresh  
10. **Fraud flagging infrastructure** — exists (enforcement missing)  

---

## 17. Priority Fix Order (for implementation phase)

### P0 — Security & trust (block production)
1. Server-side host verification against `live_rooms.host_user_id`
2. Remove OAuth admin role from public state
3. Remove mock room injection from feed
4. Block go-live when Agora token unavailable
5. Fix `platformController` userId bug
6. Server-side gift price validation

### P1 — Core live experience
7. Wire frontend to `pk:*` socket events (or remove PK UI)
8. Follow API + remove localStorage social graph
9. Socket reconnection + room state hydration
10. Redis socket adapter for scaling
11. Gift catalog API
12. Real speaking indicators via Agora volume events

### P2 — Premium feel
13. Gift animation system (SVGA/Lottie pipeline)
14. Join/leave animations for viewers
15. Split `social-live.js` + CSS code splitting
16. Unified monetization UX
17. Stream quality indicator + recovery UI

### P3 — Platform completeness
18. Moderation toolkit (kick, block, pin, delete)
19. Co-host invitation flow
20. FCM push notifications
21. Creator analytics dashboard
22. Comprehensive test suite

---

## 18. Conclusion

The application **looks like a live-streaming platform** but **behaves like a marketplace with a high-fidelity mockup overlaid**. Backend wallet/gift infrastructure shows real engineering; the live social loop — discovery, PK, followers, gift spectacle, audio room dynamics — is predominantly client-side fiction.

Until mock data is removed, host authority is server-enforced, PK is wired end-to-end, followers persist server-side, and gift animations meet industry standard, users familiar with Bigo/MICO/TikTok Live will immediately recognize this as incomplete.

**Do not market this as a live streaming platform today.**  
**Do begin implementation after approval of Phase 3 architecture.**

---

*Next document: `competitor-analysis.md`*  
*Architecture proposal: `system-architecture.md`*
