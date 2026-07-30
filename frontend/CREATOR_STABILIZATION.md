# AP Live — Creator Ecosystem Stabilization

**Status:** Creator feature freeze after deploy + regression  
**Date:** 2026-07-30  
**Policy:** No speculative creator features. Fix only bugs users hit. Measure before guessing.

---

## Freeze policy

1. **Deploy** Phases 1–3 + this stabilization pack (telemetry, infinite scroll, search identity).
2. **Run** the full regression matrix below on staging/production smoke.
3. **Invite** a small creator cohort; observe uploads → reels → live without prompting new features.
4. **Freeze** creator UX/feature work except:
   - P0 bugs (upload broken, profile empty, wrong visibility, crash)
   - Security / data-loss issues
   - Items proven by telemetry or creator feedback
5. **Shift engineering** to Live reliability, A51/Bluetooth audio, gifts, PK, agency, wallet/payouts, moderation, notifications.

---

## Device matrix (must pass)

| Device / condition | Focus |
|--------------------|--------|
| Samsung A51 | Video decode, scroll memory, audio regression (separate live suite) |
| iQOO Z9x | Upload, reels, feed switch |
| Low-memory Android | Long reel scroll, no OOM / black frames |
| Slow 3G/4G | Skeletons, retry, upload failure messaging |
| Multi-device | Upload on A → profile/feed on B |

---

## Regression checklist

### Media & posts
- [ ] Upload photo → appears Square + profile Posts tab (other device)
- [ ] Upload video → appears Video + profile Videos tab (other device)
- [ ] Private post: owner only
- [ ] Delete post: removed everywhere after refresh
- [ ] Trim markers still loop correctly (no server trim)

### Profile
- [ ] Edit bio & links (self)
- [ ] Featured video shows when public videos exist
- [ ] Agency / VIP / verified / LIVE badges consistent
- [ ] Posts \| Videos tabs filter correctly

### Engagement
- [ ] Follow / unfollow syncs across devices
- [ ] Like optimistic + rollback on failure
- [ ] Comments load/post via API
- [ ] Share increments + success feedback

### Feed & discovery
- [ ] For You / Following / Latest switch without blank flash
- [ ] Infinite scroll loads next page (Square; Video append)
- [ ] Discovery rails: Live Now / Trending / New / Because You Follow
- [ ] Blocked users absent from feed + discovery + search

### Live integration
- [ ] LIVE pill → live-room or party-room
- [ ] Profile LIVE banner deep-link

### Analytics & session
- [ ] Streamer Center content analytics period toggles
- [ ] Session expiry → re-auth without corrupting local caches
- [ ] Network drop → retry empty/error states work

### Search
- [ ] Search results use same identity badges + `userId` profile links

---

## Telemetry (lightweight)

Client batches events to `POST /api/social/client-metrics`.

| Event | Meaning |
|-------|---------|
| `feed_load_ms` | Square/Video feed fetch duration |
| `ttfv_ms` | Time to first reel video frame |
| `reel_complete` | Active reel reached near-end / loop |
| `profile_open_ms` | Engagement API latency |
| `upload_ok` / `upload_fail` | Media or create-post outcome |
| `api_error` | Social API non-2xx / throw |
| `js_error` | Window error / unhandledrejection (sampled) |

Use these to prioritize the next engineering week — not feature brainstorms.

---

## Prioritized backlog (post-freeze)

| Priority | Item | When |
|----------|------|------|
| High | Infinite scroll | **In this pack** |
| High | Search identity parity | **In this pack** |
| High | Native haptics | Next native/Expo build only |
| Medium | Bio edit sheet | After creator feedback |
| Low | FPS debug HUD | Dev-only if A51 investigation needs it |

---

## Out of scope until data says otherwise

- More profile widgets / achievements UI
- Recommendation algorithm v2
- Bookmarks / carousel
- CDN migration (ops project)
- Socket.IO engagement (architecture ready; ship when live-adjacent)
