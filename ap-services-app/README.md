# ap-services-app (Expo / Xcode)

This folder **is** the Android/iOS app you run with `npm start`.

## How it works

| Folder | Role |
|--------|------|
| **ap-services-app/** | Native shell (WebView + OAuth). **You run Expo here.** |
| **frontend/** | All screens (Explore, Party room, Live, Store, QR recharge…). Served into the WebView. |

The app loads `frontend/explore.html` (after auth) inside a WebView — not React Native screens for the feed.

## Run on device (recommended: Xcode / Android Studio, not Expo Go QR)

```powershell
cd ap-services-app
npm install
npm start
```

`npm start` serves `../frontend` at **http://YOUR_PC_IP:5500** and starts Metro.

### iOS (Xcode)

```powershell
npx expo run:ios
```

Or open the generated `ios/` project in Xcode and run on a simulator/device. **Do not rely on scanning the Expo Go QR** for production-like testing — use a dev build or Xcode.

### Android

```powershell
npx expo run:android
```

### Payments / coins

In-app recharge uses **your UPI QR** at `frontend/assets/payment-qr.png` via **Coins → Recharge** (`coins-recharge.html`) — the same manual QR + UTR flow as service booking, not the Expo dev QR.

### Points withdrawal (QR payout)

The Expo shell loads the same WebView pages as the website:

- **Profile → Withdraw** or menu **Points & Withdraw** → `points.html` → `withdraw.html`
- User uploads **their** UPI/bank QR, submits amount; admin approves in **Admin → Withdrawals**; user **Confirm receipt** on the details screen.

Deploy **`frontend/`** to Vercel and **`backend/`** to Render so the APK (production URLs) sees the new API and pages.

### Build APK for testing

```powershell
cd ap-services-app
npm install
npm run build:apk
```

Uses EAS **preview** profile (installable `.apk`). Log in with `npx eas login` if prompted.

Or local debug APK (needs Android SDK):

```powershell
npm run prebuild:android
cd android
.\gradlew.bat assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### Live streaming (Agora)

Set on your Render backend (project **ap_services** in Agora Console):

- `AGORA_APP_ID` — App ID from Agora
- `AGORA_APP_CERTIFICATE` — Primary Certificate (not the customer secret)

Local dev: these are read from `backend/.env` when you run the API from the repo root.

Then **Start Live** → Streamer Center → **Start Streaming**, or **Party** → host room. The app requests `/api/live/agora/token` when logged in.

## Production build

Deploy `frontend/` to Vercel, deploy backend with Agora env vars, then:

```powershell
eas build --platform ios
eas build --platform android
```

The WebView uses `https://ap-sevces.vercel.app` when not in dev mode (unless `EXPO_PUBLIC_WEB_URL` is set).

## If you still see the old website

- Use **`npm start`** (not `npm run start:expo-only` alone).
- Deploy `frontend/` to Vercel or set `EXPO_PUBLIC_WEB_URL` in `.env`.
