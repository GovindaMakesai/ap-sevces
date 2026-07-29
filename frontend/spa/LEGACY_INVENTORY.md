# Legacy inventory (still required by SPA)

The React shell owns navigation and primary tabs. These MPA assets remain **load-bearing** via `/spa/legacy/…` or keep-alive iframes.

## Must keep (runtime)

| Asset | Used for |
|-------|----------|
| `live-room.html` + live JS/CSS | Agora video live |
| `party-room.html` | Voice party |
| `chat.html` | Thread UI + Socket.IO composer |
| `video.html` + `social-interactions.js` | Reels playback |
| `store.html` | Gift / cosmetic store |
| `coins-recharge.html` | Wallet top-up |
| `withdraw.html` / `points.html` | Wallet outs |
| `streamer-center.html` | Go Live / host tools |
| `agency-center.html` / `bd-center.html` / `host-agency.html` / `hierarchy.html` | Agency / BD |
| `coin-seller-center.html` | Sellers |
| `creator-profile.html` | Public profiles |
| `app-auth.html` / `login.html` / `login-success.html` | OAuth |
| `help.html`, `vip.html`, `privileges.html`, `role-apply.html`, `live-verify.html`, `host-policies.html`, `referral.html` | Settings / growth links |
| `social-shell.js`, `ap-spa-embed.js`, `ap-native-boot.js`, `auth-guard.js` | Embed bridge + native boot |

## Native tab replacements (SPA owns UI)

| Old entry | SPA route |
|-----------|-----------|
| `explore.html` (feed) | `/spa/explore` |
| `profile-tab.html` | `/spa/profile` |
| `rankings.html` | `/spa/rankings` |
| Chat **list** | `/spa/chat` (thread still `chat.html`) |
| — | `/spa/search`, `/spa/settings`, `/spa/centers` |

## Safe to leave as MPA-only until cutover

Marketing / marketplace leftovers (`services.html`, `booking.html`, dashboards, etc.) — not on the social bottom nav. No delete in Phase 6.

## Delete only after

1. WebView points at `/spa/`
2. Analytics show stable SPA usage
3. Each row in “Must keep” is either ported or permanently bridged on purpose
