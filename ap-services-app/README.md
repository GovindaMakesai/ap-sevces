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
