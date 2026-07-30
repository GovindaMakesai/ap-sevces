# Production Performance & Bluetooth Report

**Branch:** `main` (production)  
**Date:** 2026-07-29  
**Scope:** Existing MPA + Expo WebView only. SPA / `spa-migration` not used.

---

## Summary

Optimizations keep the cream/gold UI unchanged while cutting blocking work, duplicate APIs, and full reloads. Bluetooth live audio is improved by stopping native/WebView audio-mode thrash that fought A2DP/SCO. A full native AudioManager SCO owner still needs a future Play build if OEM routing remains flaky.

---

## Performance optimizations

| # | Change | Files | Expected impact |
|---|--------|-------|-----------------|
| 1 | Removed chat one-time `_cb` `location.replace` double load | `frontend/chat.html` | **~1 full document load saved** on first Chat open each session |
| 2 | Paint session-cached conversations **before** “Loading…” | `frontend/chat.html` | Instant list when cache warm; no loading flash |
| 3 | Chat `styles.css` non-blocking (`media=print` → onload) | `frontend/chat.html` | Faster first paint of chat theme |
| 4 | Soft conversation loads keep API GET cache (no clear on background) | `frontend/chat.html` | Fewer duplicate `/messages/conversations` calls |
| 5 | Removed duplicate Profile `/auth/me` (`refreshProfileUser` + wallet IIFE) | `frontend/profile-tab.html` | **1 fewer** auth round-trip per Profile open |
| 6 | Profile follow stats: parallel `refreshFollowCache` + `getFollowStats` (non-blocking) | `frontend/profile-tab.html` | Stats fill sooner; header already painted |
| 7 | Live rooms public fetch: drop `Date.now()` bust + `cache: 'no-store'` | `frontend/social-shell.js` | WebView HTTP cache can help cold loads |
| 8 | Following tab: session SWR cache + `Promise.all` following/live | `frontend/social-shell.js` | Parallel APIs; skip network if &lt;60s fresh |
| 9 | Active bottom-nav re-tap: soft refresh only — **never** `location.reload()` | `frontend/social-shell.js` | No full WebView document reload on re-tap |
| 10 | Video: removed unused `fetchPros(8)` wait before reels | `frontend/social-interactions.js` | Saves `/workers` + serial delay before posts |
| 11 | Video registers `SocialNav.registerRefresh` | `frontend/social-interactions.js` | Soft re-tap refresh without reload |
| 12 | Live gift/wallet balances via `Promise.all` | `frontend/social-live.js` | Faster coin sheet / balance paint |

### Estimated feel

- **Chat first open:** often **0.5–2s** faster (no double navigation + cache-first paint).  
- **Profile:** **~200–600ms** less waiting on auth/stats when network is average.  
- **Following:** **~30–50%** less wall time when both APIs were serial; near-instant when cache fresh.  
- **Video tab:** **~200–800ms** less before first reel paint (no pros fetch).  
- **Re-tap active tab:** avoids **full multi-second reload**.

Numbers are estimates from removed round-trips / reloads, not lab RUM.

---

## Bluetooth / live audio fixes

### Root cause (production)

Live uses **Agora Web SDK inside WebView**. Native layer only calls `expo-av` `setAudioModeAsync`. There is **no** Android `AudioManager` / SCO / A2DP device picker.

Remote audio broke mainly because:

1. Every remote play posted **`force_speaker_audio` + `enterPlayback`/`enterTalk`**.  
2. `devicechange` (BT connect) re-forced speaker mode again.  
3. Rapid `setAudioModeAsync` fights Bluetooth routing and can silence WebRTC sinks.

### Fixes shipped

| # | Change | Files |
|---|--------|-------|
| 1 | Debounce / coalesce `requestNativeSpeakerAudio`; post `force_speaker_audio` once per mode | `frontend/social-live.js` |
| 2 | `devicechange`: reevaluate + remount remotes **only** — no second speaker force | `frontend/social-live.js` |
| 3 | `playRemoteAudio`: arm native speaker **once** per session, not every tick | `frontend/live-media-engine.js` |
| 4 | `LiveAudioRoute`: 2s cooldown skips redundant `setAudioModeAsync` | `ap-services-app/liveAudioRoute.js` |
| 5 | `force_speaker_audio` ignored if already in matching mode &lt;2s | `ap-services-app/App.js` |
| 6 | Host mic picker **prefers** BT/wired headset labels when present | `frontend/social-live.js` |

### Still limited by architecture

- No native SCO start/stop or `AudioDeviceCallback` — OS chooses BT profile.  
- Android WebView **cannot** `setSinkId` — routing is OS + expo-av only.  
- Host stays in **playback** mode (Samsung AEC) — correct for uplink, limits duplex headset tricks.  
- **Native app changes** (`liveAudioRoute.js`, `App.js`) need a **future Expo/Play build** to reach store users; web fixes apply as soon as frontend is deployed.

### Device matrix (after frontend deploy + next AAB)

| Route | Expected |
|-------|----------|
| Phone speaker | OK (unchanged) |
| Wired headset | OK — fewer mode thrash events |
| BT earbuds / headset | Much more stable remote audio; verify mid-stream connect |
| BT speaker | Same — prefer A2DP via less thrash |
| Host mic on BT | Prefers headset input when labeled |

---

## What we did **not** change

- No UI / theme / layout redesign  
- No SPA merge or `spa-migration` work  
- No AAB / Play Store / package name / signing changes  
- WebView entry still production MPA  

---

## Remaining architectural limits

1. **MPA tab switches** still use full `location.href` document loads (instant paint + SWR mitigate).  
2. **Live room** still loads a large sync script stack — further `defer` is possible but riskier.  
3. **True BT SCO ownership** needs a small native AudioManager module + new Play build.  
4. SPA remains a **future** project; production stays on this MPA path.
