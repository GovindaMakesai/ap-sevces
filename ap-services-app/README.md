# ap-services-app (Expo)

This folder **is** the Android/iOS app you run with `npm start`.

## How it works

| Folder | Role |
|--------|------|
| **ap-services-app/** | Native shell (WebView + OAuth). **You run Expo here.** |
| **frontend/** | All screens (Explore, Party, Store, VIP…). Served into the WebView. |

The app is **not** built with React Native screens for the home feed — it loads `frontend/explore.html` inside a WebView.

## Run the new design on your phone

```powershell
cd ap-services-app
npm install
npm start
```

`npm start` does two things:

1. Serves `../frontend` at **http://YOUR_PC_IP:5500**
2. Starts Expo — the WebView opens **http://YOUR_PC_IP:5500/explore.html**

Scan the QR code. At the top you should see a purple dev bar: **🟢 Local new UI**.

## If you still see the old website

- You used `npm run start:expo-only` without the local server → use **`npm start`** only.
- Or production Vercel is used → deploy `frontend/` or set `EXPO_PUBLIC_WEB_URL` in `.env`.

## Production build

Deploy `frontend/` to Vercel first, then EAS build. The WebView uses `https://ap-sevces.vercel.app/explore.html` when not in dev mode.
