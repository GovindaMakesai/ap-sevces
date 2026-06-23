# Client Expo / EAS (Muqaddas Technology — Arif)

This app is owned by the **client**, not the developer.

| Field | Value |
|--------|--------|
| Expo account (owner) | `aparif786-web` |
| Contact | `aparif786@gmail.com` |
| Play developer name | muqaddas technology |
| Android package | `com.apservices.app` |
| Firebase project | `muqaddas-technology` |

## First-time setup (client)

```powershell
cd ap-services-app
npm install
npx eas login
```

Log in with the **client** Expo account (`aparif786-web` / `aparif786@gmail.com`).

Link or create the EAS project (writes `projectId` into `app.json`):

```powershell
npx eas init
```

## Build release AAB

```powershell
npm run build:aab
```

Or cloud build:

```powershell
npx eas build --platform android --profile production
```

## Upload key

Local signed builds use `ap-services-upload.jks` (see `scripts/setup-play-upload-key.ps1`).

Do **not** use developer Expo accounts or keystores for production releases.
