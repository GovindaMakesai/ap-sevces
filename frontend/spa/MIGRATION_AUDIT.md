# SPA Migration Audit Report (re-audit)

**Branch:** `spa-migration`  
**Date:** 2026-07-29 (post-blocker fixes)  
**WebView entry:** still `explore.html` (**not flipped**)  
**Verdict:** **CONDITIONAL READY** for native SPA entry cutover after manual QA

---

## Verdict summary

| Gate | Status |
|------|--------|
| SPA shell builds | **Pass** |
| Production-critical Live/Chat/auth navigations use `spaNavigate` | **Pass** (re-audited) |
| Android back/home aware of `/spa/*` | **Pass** (App.js inject + `__AP_SPA_HARDWARE_BACK`; entry unchanged) |
| Join/Leave/Go Live / Chat thread / Wallet links routed via bridge | **Pass** (code) — **manual device QA still required** |
| Unnecessary iframe reloads reduced | **Pass** (leave-live → parent `/spa/explore`; chat close → `/chat`) |
| WebView **entry** flipped to `/spa/explore` | **Not done** (gated on your approval + QA) |

**Do not change the WebView start URL until the manual QA checklist below is signed off.**

---

## What was fixed since the previous audit

1. **`ap-spa-embed.js`** — full `apSpaNavigate` / `apSpaBack` + shell→iframe `hardware_back` listener  
2. **`social-live.js`** — Leave Live, auth redirects, profiles, browse, streamer start → `apGo` / `apGoExplore`  
3. **`chat.html`** — auth, invites, recharge, profiles, centers, thread close → `apChatGo`  
4. **`social-nav.js` / `social-interactions.js`** — navigate/back/auth/recharge/reels → bridge  
5. **`social-shell.js`** — bind embed bridge even on immersive live pages  
6. **Scripts** — `ap-spa-embed.js` on `live-room.html`, `party-room.html`, `chat.html`  
7. **SPA** — `SpaHardwareBack` registers `window.__AP_SPA_HARDWARE_BACK`  
8. **`App.js`** — back/home/minimize treat `/spa/explore` as home when under `/spa/`; **entry URL still `explore.html`**

---

## Feature matrix (updated)

| Feature | Status | Notes |
|---------|--------|-------|
| Login / Logout | Partial / Full | OAuth via `/spa/login` iframe; logout native |
| Signup / OTP | Partial / N/A | OAuth; no product OTP |
| Explore | Full | Native |
| Join / Leave / Go Live | Partial | Legacy Agora iframe; navigations bridged |
| Chat list / thread | Full / Partial | List native; thread iframe + bridged exits |
| Video / Reels | Partial | Keep-alive player; reel opens bridged |
| Profile / Edit photo | Full / Partial | Edit → profile-tab legacy |
| Wallet / Top Up / Withdraw | Partial | Balances native; money UIs legacy + bridged links |
| Gifts / FX | Legacy | Inside live/chat iframes (unchanged, correct) |
| Agency / Rankings / Search / Settings | Partial / Full | As before |
| Android back | **Mitigated** | SPA + App.js aware; needs device confirmation |
| Agora / Socket.IO | Legacy | Intentional |

---

## Remaining non-blocking risks

| Risk | Severity |
|------|----------|
| Manual QA not yet run on a physical Android WebView against `/spa/` | **Major (process)** |
| OAuth callback edge cases inside login iframe | Minor |
| Non-critical marketplace HTML still uses raw `location.href` | Minor |
| Multiple keep-alive iframes → memory | Minor |
| FCP/TTI/FPS lab numbers still unmeasured | Info |

---

## Manual QA checklist (required before entry flip)

Run with SPA loaded (`/spa/explore` via preview or `?try_spa=1` / temporary env — **not** production entry yet):

- [ ] Join Live → watch → Android back / Leave → lands on `/spa/explore` (not blank/login)  
- [ ] Go Live / Party from streamer center → room → leave → SPA explore  
- [ ] Open Chat thread → send message → close/back → chat list on `/spa/chat`  
- [ ] Profile → Top Up / Withdraw / Store open under `/spa/legacy/…` → Back returns  
- [ ] Send gift in live → FX plays  
- [ ] Login / logout from `/spa/login`  
- [ ] Double-back on `/spa/explore` shows exit toast (does not jump to MPA login)

---

## Entry cutover (still blocked on approval)

When QA passes, follow `CUTOVER.md`: change `buildWebUri` / home to `/spa/explore` in a **dedicated** release. Until then keep production entry on `explore.html`.

---

## Performance (static)

Unchanged order of magnitude: SPA JS ~**307 KB** raw (app ~222 KB after hardware-back hook). Lab metrics still pending.
