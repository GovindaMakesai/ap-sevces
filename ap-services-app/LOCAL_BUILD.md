# Local Android release (AAB) — AP Services

Production builds are **local only**. No Expo account or EAS cloud build is required.

| Field | Value |
|--------|--------|
| App name | AP Services |
| Android package | `com.apservices.app` |
| Play developer | Muqaddas Technology |
| Production API | `https://api.apservices.in` |

## One-time setup

1. Install **Node.js 20+**, **Android Studio** (SDK + build-tools), and **Java JDK 17**.
2. Set `ANDROID_HOME` to your SDK path (usually `%LOCALAPPDATA%\Android\Sdk`).
3. Create the Play upload keystore (once):

```powershell
cd ap-services-app
npm install
npm run setup:play-key
```

This creates `credentials/upload.jks` (gitignored). Register the exported PEM in Google Play Console if you reset the upload key.

4. Copy the example signing config and set your keystore passwords:

```powershell
copy scripts\play-upload.local.properties.example scripts\play-upload.local.properties
# Edit play-upload.local.properties — never commit this file
```

## Build signed AAB (v1.0.18+)

```powershell
cd ap-services-app
npm run build:aab
```

Output:

- `dist/ap-services-<version>-release.aab`
- Copy on Desktop: `ap-services-<version>-release.aab`

Upload the `.aab` to **Play Console → Production → Create new release**.

## What this build includes

- Native Android back button → minimizes live/party (no app exit)
- Background playback hooks for live video & voice rooms
- WebView loads UI from `https://api.apservices.in` (mini-player, live session, etc.)

## Notes

- `scripts/play-upload.local.properties`, `credentials/*.jks`, and `dist/*.aab` are gitignored.
- Do **not** use `eas build` for client releases unless Muqaddas Technology sets up their own Expo account.
