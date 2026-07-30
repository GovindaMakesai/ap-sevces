## Visual parity (2026-07-29)

SPA tab screens **must not redesign** production UI. Explore / Video / Chat / Profile / Rankings are keep-alive embeds of the production HTML (`explore.html`, `video.html`, `chat.html`, `profile-tab.html`, `rankings.html`) with `spa_embed=1`. Shell chrome loads `social-theme.css` and uses the production `.social-bottom-nav` (Video · Rankings · Explore planet · Chat · Profile). Architecture (client routing, keep-alive, bridge) only — cream/gold theme unchanged.

---

**Branch:** `spa-migration`  
**QA date:** 2026-07-29  
**Environment:** Vite SPA `http://localhost:5173/spa/*` (desktop browser automation)  
**WebView entry:** still `explore.html` (**not flipped**)  
**Verdict:** **NOT READY** for native SPA entry cutover

---

## Verdict summary

| Gate | Status |
|------|--------|
| SPA shell builds / routes | **Pass** |
| Production-critical Live/Chat/auth navigations use bridge | **Pass** (code) |
| Android back/home aware of `/spa/*` | **Pass** (code + browser `__AP_SPA_HARDWARE_BACK`) |
| Manual QA checklist (all critical flows) | **Fail / blocked** — see table below |
| WebView **entry** flipped to `/spa/explore` | **Not done** — **do not flip** until checklist is green on device + live API |

**Recommendation: do not change the WebView start URL.** Re-run checklist when `api.apservices.in` is reachable and on a physical Android WebView (`?try_spa=1` or preview), then re-decide.

---

## Manual QA results (2026-07-29)

**Env note:** `api.apservices.in` and Vite `/api` proxy were unreachable from this machine (`curl` connect failure / rooms & rankings showed load errors). Join/watch, send message, and gift FX could not be exercised end-to-end. Android exit toast requires the native WebView.

| # | Checklist item | Result | Evidence / notes |
|---|----------------|--------|------------------|
| 1 | Join Live → watch → Android back / Leave → `/spa/explore` | **Partial Pass** | **Fail/Blocked:** no live rooms (API down). **Pass:** synthetic `/spa/legacy/live-room.html?channel=…` Leave → `/spa/explore`. **Pass (after fix):** `__AP_SPA_HARDWARE_BACK` from live → `/spa/explore` (was wrongly landing on Chat). |
| 2 | Go Live / Party from streamer center → room → leave → SPA explore | **Partial Pass** | **Pass:** Go Live → `/spa/legacy/streamer-center.html`; Back → `/spa/explore`. **Pass:** synthetic party Leave → `/spa/explore`. **Blocked:** starting a real live/party room (API/auth). |
| 3 | Open Chat thread → send message → close/back → `/spa/chat` | **Partial Pass** | **Pass:** `/spa/chat?conversation=…` opens legacy `chat.html` iframe; **Chats** / hardware back → `/spa/chat`. **Blocked:** send message (API). |
| 4 | Profile → Top Up / Withdraw / Store under `/spa/legacy/…` → Back | **Pass** | Seeded session: Top Up → `…/legacy/coins-recharge.html?app=1` → Back → `/spa/profile`. Withdraw → `…/withdraw.html`. Store → `…/store.html`. All returned to profile. |
| 5 | Send gift in live → FX plays | **Blocked** | No reachable API / real room; not exercised. |
| 6 | Login / logout from `/spa/login` | **Partial Pass** | **Pass:** `/spa/login` loads `app-auth.html` iframe. **Pass:** Logout → `/spa/login`. **Blocked:** full OAuth sign-in (manual IdP). |
| 7 | Double-back on `/spa/explore` shows exit toast (no MPA login jump) | **Partial Pass** | **Pass:** on `/spa/explore`, `__AP_SPA_HARDWARE_BACK()` returns `false` (native should own double-press). **Blocked:** toast / exit not verified in Android WebView. |

### Critical-flow gate

Entry flip requires **Pass** on items **1–7** with real Live/Chat/gifts and device back. Current status does **not** meet that bar.

---

## Failures found in QA and fixes applied

| Bug | Severity | Fix |
|-----|----------|-----|
| Immersive **Leave room** used `navigate(-1)` and stayed on the room URL when history was long | **Critical** | `LegacyBridgePage`: Leave → `navigate('/explore', { replace: true })` |
| Android/hardware back from live posted iframe `hardware_back` → `spaBack` → shell `navigate(-1)` (often **Chat**); delayed explore navigate was dropped after unmount | **Critical** | `SpaHardwareBack`: live → Explore immediately (no iframe-first back). `SpaNavBridge`: `back` from live/party legacy → Explore. `ap-spa-embed.js`: `hardware_back` fallback → Explore, not `spaBack` |

**Entry point unchanged:** `ap-services-app/App.js` `buildWebUri` still `${base}/explore.html`.

---

## What was fixed since the previous audit (engineering)

1. **`ap-spa-embed.js`** — `apSpaNavigate` / `apSpaBack` + shell→iframe `hardware_back`; fallback → Explore  
2. **`social-live.js` / `chat.html` / nav scripts** — bridged leave/auth/wallet navigations  
3. **SPA** — `SpaHardwareBack`, Leave-room Explore fix, live `back` → Explore  
4. **`App.js`** — back/home/minimize SPA-aware when under `/spa/`; **entry still `explore.html`**

---

## Feature matrix (unchanged intent)

| Feature | Status | Notes |
|---------|--------|-------|
| Login / Logout | Partial / Full | OAuth via `/spa/login` iframe; logout native (QA: logout Pass; OAuth blocked) |
| Explore | Full | Native; room list needs API |
| Join / Leave / Go Live | Partial | Leave/nav Pass in shell; join/watch blocked in this env |
| Chat list / thread | Full / Partial | Thread open/close Pass; send blocked |
| Gifts / FX | Legacy | Not QA’d this run |
| Android back | Mitigated | Shell path Pass in browser; device toast pending |

---

## Remaining blockers before entry flip

| Risk | Severity |
|------|----------|
| Re-run QA with live API: Join Live, gift FX, send chat message | **Blocker** |
| Android WebView: double-back exit toast + full Leave from a real room | **Blocker** |
| OAuth login smoke on device under `/spa/login` | Major |
| FCP/TTI/FPS lab numbers | Info |

---

## Entry cutover (still blocked)

When the checklist above is all **Pass** on device + API, follow `CUTOVER.md` in a **dedicated** release. Until then keep production entry on `explore.html`.

---

## Performance (static)

Unchanged order of magnitude: SPA JS ~**307 KB** raw. Lab metrics still pending.
