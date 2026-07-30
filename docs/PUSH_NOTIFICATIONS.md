# AP Live – Firebase Cloud Messaging (FCM)

Production push notifications for the Expo WebView app.

## What was built

| Piece | Path |
|-------|------|
| Token table | `user_push_tokens` (+ prefs on `user_notification_settings`) |
| Schema ensure | `backend/config/ensurePushNotificationsSchema.js` |
| PushService | `backend/services/pushNotificationService.js` |
| Queue | `backend/services/notificationQueue.js` |
| Templates | `backend/services/notificationTemplates.js` |
| API | `POST /api/push/register-token`, `POST /api/push/remove-token`, `GET/PUT /api/push/settings` |
| Settings UI | `frontend/notification-settings.html` |
| Expo client | `ap-services-app/pushNotifications.js` |

## Events → push

- **Live / Party** – after `hostRoom` succeeds → followers, recent gifters (“fans”), agency hosts
- **Follow** – new follower
- **Gift** – receiver
- **Comment / @mention** – post owner / mentioned users
- **Post** – followers (public posts)
- **Agency** – host approved/rejected, new host joined, commission received

Deep links: `aplive://live/{channel}`, `aplive://party/{channel}` (also handled as `apservices://…`).

## VPS env

Prefer Firebase Admin (HTTP v1):

```bash
# Paste the full service-account JSON as one line
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

Legacy fallback (optional):

```bash
FCM_SERVER_KEY=AAAA...
```

Without either key, the server **stubs** sends (logs only) so local/dev stays safe.

## Android / Expo

1. `ap-services-app/google-services.json` is present (package `com.apservices.app`, project `muqaddas-technology`)
2. `app.json` → `android.googleServicesFile: "./google-services.json"`
3. `expo-notifications` plugin: icon, color `#C9A227`, `defaultChannel: "default"`
4. Rebuild a **native** binary after adding google-services (`npm run build:aab` / EAS) — Expo Go will not receive production FCM the same way
5. On VPS set `FIREBASE_SERVICE_ACCOUNT_JSON` (or legacy `FCM_SERVER_KEY`) so the API can send

Grant notification permission after login; token posts to `/api/push/register-token`.


## Ops notes

- Invalid FCM tokens are deleted automatically
- Failures are written to `push_delivery_log`
- Queue batches (~80), retries up to 3× with backoff, dedupes by event key
- User prefs: Live, Posts, Comments, Mentions, Follows, Gifts, Agency (+ master `push_enabled`)
