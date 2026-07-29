# SPA cutover checklist (Phase 6)

**Status on `spa-migration`:** source migration is ready for a **gated** cutover.  
**Not done in this phase (by design):** Expo/EAS/AAB, Play Store, package name, signing, or changing the production WebView start URL.

Production MPA (`explore.html?app=1`) remains the live native entry until you explicitly approve a separate app release.

---

## What “cutover” means

| Layer | Today (safe) | After cutover (separate release) |
|-------|----------------|-----------------------------------|
| Web / Vercel | MPA at `/` + SPA at `/spa/` | Same; SPA is primary for web testers |
| Expo WebView | `…/explore.html?app=1` | `…/spa/explore?app=1` (or `/spa/?app=1`) |
| Legacy HTML | Still required for live/gifts/agency/store | Keep until those screens are ported |

---

## Pre-flight (repo)

1. On branch `spa-migration`:
   ```bash
   cd frontend/spa
   npm ci
   npm run typecheck
   npm run build
   ```
2. Confirm `frontend/spa/dist/index.html` exists.
3. Deploy this branch to a **preview** (or staging) host — do **not** push to production `main` until approved.
4. Open `https://<preview>/spa/explore` and verify:
   - Tabs (Live, Video, Chat, Me, Rankings)
   - Search / Settings / Centers
   - Open a live room via `/spa/legacy/live-room.html?…`
   - Login via `/spa/login`
   - Browser back from room returns to Explore

---

## Web opt-in (no native change)

- Preview entry: `/go-spa.html` → redirects to `/spa/explore`
- Or: `/explore.html?try_spa=1` → client redirect to `/spa/explore` (opt-in only)

Native app does **not** send `try_spa=1`, so behavior stays MPA until WebView URL changes.

---

## Native WebView change (DO NOT APPLY until release day)

File: `ap-services-app/App.js` (approx. `buildWebUri` / explore entry).

Today (conceptually):

```js
return `${frontendBase}/explore.html${q}`;
```

Target:

```js
return `${frontendBase}/spa/explore${q}`; // q should include app=1
```

Also review injected strings that hardcode `/explore.html` (PiP minimize, error recovery) and point them at `/spa/explore` in the **same** release.

Env alternative (no code edit if URL is fully overridden):

```env
EXPO_PUBLIC_WEB_URL=https://ap-sevces.vercel.app/spa/explore
```

Then ship via EAS **only when product signs off** — that build is out of scope for this source refactor.

---

## Vercel

Routes already map:

- `/spa` → `frontend/spa/dist/index.html`
- `/spa/assets/*` → `frontend/spa/dist/assets/*`
- `/spa/*` → SPA `index.html` (client router)

**Deploy requirement:** run `npm run build` inside `frontend/spa` **before** the Vercel static upload (or commit `dist` on the release branch). Preview without `dist` will 404 `/spa`.

Helper:

```bash
npm run build --prefix frontend/spa
```

---

## Rollback

1. Native: ship previous AAB / revert WebView URL to `/explore.html?app=1`.
2. Web: stop linking `/spa`; MPA pages remain intact.
3. Git: `spa-migration` can stay; production stays on `main` MPA.

---

## Do not delete yet

Do **not** delete MPA HTML in Phase 6 prep. Live room, chat thread, video reels, store, recharge, and agency dashboards still load from those files via `/spa/legacy/*`.

See `LEGACY_INVENTORY.md`.
