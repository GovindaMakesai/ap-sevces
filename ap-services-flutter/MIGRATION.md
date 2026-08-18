# Migration: ap-services-app → Flutter (native)

## Source of truth

The Flutter app **replaces `ap-services-app/`** from the GitHub repo — not the standalone `frontend/` website.

| Folder | Role |
|--------|------|
| **`ap-services-app/`** | Expo shell: WebView + OAuth + push + live audio + secure capture → **migrate this** |
| **`frontend/`** | HTML loaded inside the WebView — **reference only** for UI flows and API shapes |
| **`ap-services-flutter/`** | Native Flutter replacement — same backend, **no WebView** |

## What we migrate from ap-services-app

- Package: `com.apservices.app`
- Name: **AP Live Service**
- Version: `1.0.36` (build `52`) — matches `app.json`
- OAuth: `apservices://oauth-complete` (+ `aplive://`)
- API: `https://api.apservices.in/api` (`config/production-api.js`)
- Social/live flows only — **no workers, services marketplace, or booking**

## Native shell features (ap-services-app → Flutter)

| ap-services-app (Expo) | Flutter |
|------------------------|---------|
| WebView → frontend | **Native screens** (Explore, Live, Chat, Profile, Store…) |
| OAuth (`expo-web-browser`) | `flutter_web_auth_2` + `apservices://` |
| Push (`pushNotifications.js`) | `firebase_messaging` + `google-services.json` from ap-services-app |
| Live audio (`liveAudioRoute.js` + `ApLiveAudio`) | `LiveAudioRoute` + Android `MethodChannel` in `MainActivity.kt` |
| Screen capture block on live | `SecureScreenService` → `FLAG_SECURE` on live/party screens |
| Push deep links (`resolvePushDeepLink`) | `DeepLinkService` → Flutter routes (`/live`, `/party`, `/chat-thread`…) |
| Hardware back on live | `PopScope` on `LiveRoomScreen` |
| Session inject to WebView | `AuthService` + secure storage |

## What we do NOT migrate

- WebView wrapper itself
- Worker dashboard / services marketplace / booking HTML
- Coin seller ops center
- Admin dashboard in the mobile shell

## Project location

```
glowcast-source/
  ap-services-app/      ← React Native Expo (source)
  ap-services-flutter/  ← Flutter replacement (this project)
  frontend/             ← Web UI reference only
  backend/              ← API (unchanged)
```

## Read-only preview builds

`AppConfig.readOnlyMode = true` — login and browse live data; block gifts, chat send, wallet writes. Set to `false` when ready for production writes.

## Build APK

```powershell
cd glowcast-source/ap-services-flutter
flutter pub get
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk`
