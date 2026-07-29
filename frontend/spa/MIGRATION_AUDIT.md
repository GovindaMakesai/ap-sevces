# SPA Migration Audit Report

**Branch:** `spa-migration`  
**Date:** 2026-07-29  
**Scope:** Source audit only — **App.js / WebView entry not modified**  
**Verdict:** **NOT READY** for native WebView flip

---

## Executive verdict

| Gate | Status |
|------|--------|
| SPA shell builds | Pass (`npm run build:spa`) |
| Primary tabs client-routed | Pass (Explore, Chat list, Video shell, Rankings, Profile) |
| Critical social features available | Pass via **legacy iframes** |
| No full reloads inside SPA shell chrome | Pass |
| No remaining `location.href` in legacy embeds | **Fail** (chat / live / many MPA pages) |
| Android back aware of `/spa/` | **Fail** (`App.js` hardcodes `explore.html`) |
| Profile photo editable from SPA Me | Mitigated (Edit Profile → legacy bridge) |
| Lab perf (FCP/TTI/FPS/memory) | **Not measured** (needs device / Lighthouse) |

**Do not change WebView entry until blockers below are closed.**

---

## Feature matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Login (OAuth) | Partial | `/spa/login` → iframe `app-auth.html` |
| Logout | Full (SPA) | Clears Zustand + storage → login |
| Signup | Partial | Same OAuth path; `register.html` not first-class in SPA |
| OTP / phone email | N/A / absent | No live OTP product flow found (not SPA regression) |
| Home / Explore | Full (SPA) | Native rooms grid |
| Live Rooms list | Full (SPA) | `GET /live/rooms` |
| Join Live | Partial | Opens `/spa/legacy/live-room.html` (Agora MPA) |
| Go Live | Partial | → streamer-center / live-room legacy |
| Chat list | Full (SPA) | `GET /messages/conversations` |
| Messages / thread | Partial | iframe `chat.html` + Socket.IO |
| Video / Reels | Partial | keep-alive `video.html` (+ optional grid) |
| Profile | Full (SPA) | me / wallet / stats |
| Edit profile / photo | Partial | Menu → `profile-tab.html` legacy |
| Wallet balances | Full (SPA) | on Profile |
| Top Up | Partial | → `coins-recharge.html` legacy |
| Withdraw | Partial | → `withdraw.html` legacy |
| Gifts send | Legacy | Inside live/chat iframes |
| Gift animations | Legacy | `social-fx.js` in those pages |
| Agency / Centers | Partial | Native hub → legacy dashboards |
| Rankings | Full (SPA) | `GET /v1/leaderboards` |
| Notifications settings | Partial | SPA toggles API; no FCM token registration |
| Push notifications | Legacy / gap | Backend FCM exists; Expo app has no `expo-notifications` |
| Search | Full (SPA) | `GET /search` |
| Settings | Full (SPA) | Hub + toggles |
| Deep links | Partial | `mapLegacyHrefToSpa` + `/legacy/*`; native inject still MPA-centric |
| Android back | **Blocker** | `App.js` → `/explore.html` only |
| Session persistence | Pass | `localStorage` + Zustand hydrate |
| Image uploads | Partial | Chat/live cover in legacy; profile via Edit Profile bridge |
| Audio / video / Agora | Legacy | `live-room` / `party-room` iframes |
| WebRTC | Legacy | Via Agora SDK in live room |
| Socket.IO | Legacy | chat + live iframes |
| API calls (shell) | Pass | TanStack Query; see duplicate notes |
| Error / loading UI | Partial | Native lists have retry; legacy pages keep own UX |

---

## Remaining legacy pages / iframes

### Keep-alive / shell iframes
- `/spa/login` → `app-auth.html`
- Chat **thread** → `chat.html`
- Video **Reels** → `video.html`

### `/spa/legacy/*` bridge (non-exhaustive but production-critical)
- `live-room.html`, `party-room.html`
- `streamer-center.html`, `agency-center.html`, `bd-center.html`, `host-agency.html`, `hierarchy.html`
- `store.html`, `coins-recharge.html`, `withdraw.html`, `points.html`
- `creator-profile.html`, `profile-tab.html` (edit/photo)
- `coin-seller-center.html`, `live-verify.html`, `role-apply.html`
- `help.html`, `vip.html`, `privileges.html`, `referral.html`, …
- Full list: `frontend/spa/LEGACY_INVENTORY.md`

### Not mounted as keep-alive (good)
- `explore.html`, `profile-tab.html` (as Me tab), `rankings.html` — replaced by native screens

---

## `location.href` / full reload audit

| Layer | Finding |
|-------|---------|
| SPA React (`frontend/spa/src`) | No shell navigations via `location.href`. External-only `assign` fallback in bridge. Bottom nav = `NavLink`. |
| `social-shell.js` | Uses `spaNavigate` when `spa_embed=1`; falls back to `location.href` outside embed. |
| `ap-spa-embed.js` | Click capture → postMessage (anchors only). |
| `chat.html`, `social-live.js`, `social-interactions.js`, many `*.html` | **Dozens of raw `location.href` / `replace`** — inside iframe these reload **iframe document**, not parent shell (unless they hit top window). **Major** for leave-live → explore, auth redirects, profile opens. |
| `auth-guard.js` | Prefers `spaNavigate` when available. |
| `ap-native-boot.js` | Some `location.replace` for unauth; spa_embed posts to parent for auth. |

**Gap:** Programmatic navigations in `social-live.js` / `chat.html` are not fully wrapped in `spaNavigate`.

---

## Duplicate API risk

| Risk | Severity | Detail |
|------|----------|--------|
| Explore double-fetch | Low | Native only; no explore iframe |
| Profile double-fetch | Low | Native only; profile-tab not keep-alive |
| Chat list + unread | Minor | Separate queries (`conversations` may already include `totalUnread`) |
| Chat thread remount | Expected | Thread iframe refetches history/sockets |
| Video Reels iframe | Expected | Full MPA boot inside keep-alive |
| Legacy page own `/auth/me` | Minor | When opening store/agency iframes |

TanStack Query defaults: `staleTime` 30–120s, `refetchOnWindowFocus: false` — good for shell.

---

## Performance (static / build)

Measured from `frontend/spa/dist` after `npm run build:spa` (2026-07-29):

| Asset | Size |
|-------|------|
| `index-*.js` (app) | **215.5 KB** |
| `vendor-*.js` | **41.6 KB** |
| `query-*.js` | **49.1 KB** |
| **Total JS (raw)** | **~306 KB** |
| CSS | **~12 KB** |

| Metric | Result |
|--------|--------|
| Initial load time | **Not lab-measured** — expect SPA shell + later iframe cost for live/video |
| Navigation latency (tabs) | **Expected instant** (keep-alive / native; no HTML reload) |
| FCP / TTI | **Not measured** — run Lighthouse on `/spa/explore` preview |
| JS execution | Split chunks (vendor/query/app) |
| Memory | Risk: multiple keep-alive iframes (video + chat thread) |
| FPS scrolling | Native Explore/Chat/Rankings lists — **not measured** |

**Improvements vs MPA:** tab switches no longer tear down/re-init full HTML for Explore/Profile/Rankings/Chat list.

**Regressions vs MPA:** opening Live still loads heavy Agora stack in iframe; Video tab may keep a heavy iframe mounted.

---

## Known bugs / gaps

1. **Blocker — Android back / home inject** still targets `/explore.html` (`App.js`). Flip without fixing → broken back / forced MPA.
2. **Major — live/chat programmatic `location.href`** not spa-bridged → iframe-only navigation / leave-room may not return to `/spa/explore`.
3. **Major — OAuth inside login iframe** relies on token poll; edge cases if callback navigates iframe only.
4. **Minor — Chat unread + conversations** possibly redundant.
5. **Minor — Push:** settings toggles without device token registration (pre-existing).
6. **Docs drift:** some Phase-1 wording in older commits; `SPA_MIGRATION.md` / this audit are source of truth.

---

## Cutover blockers (must close before App.js flip)

1. Update `App.js` hardware back + minimize + home URLs to `/spa/explore` (same release) — **not done** (per instructions).
2. Bridge or rewrite critical `social-live.js` / `chat.html` exits to `spaNavigate` / `postMessage`.
3. Preview deploy with `frontend/spa/dist`; manual QA checklist for Join Live, Go Live, gifts, chat thread, recharge.
4. Optional: Lighthouse + WebView memory pass on mid-tier Android.

---

## Recommendation

- **Continue web/preview SPA testing** via `/spa/`, `/go-spa.html`, `?try_spa=1`.
- **Do not** set WebView entry to SPA yet.
- Next engineering slice: wrap live/chat leave/auth navigations with `spaNavigate`, then App.js back/home patch when you approve the flip.
