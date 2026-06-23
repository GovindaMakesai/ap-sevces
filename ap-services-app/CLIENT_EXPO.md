# Expo / EAS (Play Store — Muqaddas Technology)

| Field | Value |
|--------|--------|
| Expo account (owner) | `aparif786-web` |
| Contact | `aparif786@gmail.com` |
| Play developer name | muqaddas technology |
| Android package | `com.apservices.app` |
| Firebase project | `muqaddas-technology` |

Source code stays on **github.com/GovindaMakesai/ap-sevces** until a full handover.

## EAS setup

```powershell
cd ap-services-app
npm install
npx eas login
npx eas init
```

Log in with the Play Console Expo account (`aparif786-web`).

## Build release AAB

```powershell
npm run build:aab
```

Local signing uses `ap-services-upload.jks` — see `scripts/setup-play-upload-key.ps1`.
