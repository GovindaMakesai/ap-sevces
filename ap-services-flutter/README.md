# GlowCast — Native Flutter Live Social App

Full native Flutter rebuild of [glowcast](https://github.com/GovindaMakesai/glowcast). **No WebView. No React Native.**

Uses the **same backend** (`https://api.apservices.in/api`) with identical social/live functionality.

## What's included (same as web app)

- **Bottom nav:** Video · Rankings · Explore · Chat · Profile
- **Explore:** Following / Live / Party / New / Nearby + Go Live & Party FABs
- **Live & Party rooms:** Agora RTC + Socket.io chat + gifts
- **Video reels / Square:** Posts feed, like, follow, gift
- **Chat:** Conversations + realtime DMs
- **Profile hub:** Wallet, recharge, withdraw, points, store, VIP
- **Streamer Center:** Analytics, verification, go live
- **Referral, Rankings, Discover Creators, Search**
- **OAuth** (Google/Facebook/GitHub) + email login
- **Gold/cream theme** matching the original design

## Explicitly removed (not in Flutter app)

These legacy marketplace modules are **completely excluded**:

- Workers / worker dashboard
- Services marketplace & booking
- Customer dashboard (home services)
- Become a Pro (marketplace)
- Coin seller operations center

## Run

```bash
cd glowcast
flutter pub get
flutter run
```

## Config

API URL: `lib/config/app_config.dart`  
Scope notes: `lib/config/app_scope.dart`

## Architecture

```
lib/
  config/       Theme, API, scope (no workers/services)
  models/       User, LiveRoom, Social, Store, Wallet
  services/     API, Auth, Live, Chat, Social, Wallet, Socket, Host…
  screens/      Auth, Explore, Live, Party, Video, Chat, Profile, Store…
  widgets/      Bottom nav, room cards, gift sheet
```

## OAuth

Deep link: `glowcast://oauth-complete` (configured in Android/iOS)
