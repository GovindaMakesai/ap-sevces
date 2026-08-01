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
- **Chat message** – receiver (HTTP + socket sends)
- **Wallet** – coins credited / system wallet alerts
- **Withdrawal** – submitted / paid / completed / rejected (user) + new request (admins)
- **Agency** – host approved/rejected, new host joined, commission received, new host/agency applications
- **Admin** – withdrawals, role applications, recharges (via `notifyAllAdmins`)

Deep links: `aplive://live/{channel}`, `aplive://party/{channel}`, `aplive://chat/{id}`, `aplive://withdraw`, `aplive://wallet`, `aplive://admin/{section}` (also handled as `apservices://…`).

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

## Quick test (after device registered)

```bash
# Logged-in user JWT required
curl -s -H "Authorization: Bearer $TOKEN" https://api.apservices.in/api/push/diagnostics
curl -s -X POST -H "Authorization: Bearer $TOKEN" https://api.apservices.in/api/push/test
```

Or from repo:

```bash
node backend/scripts/test-push.js
node backend/scripts/test-push.js --send --email=you@example.com
```

Requires `FIREBASE_SERVICE_ACCOUNT_JSON` in `backend/.env` (or on the VPS) for a real FCM send. Without it the server stubs and logs `error_code=stub`.

**App:** install **1.0.33+** (google-services plugin). 1.0.32 cannot obtain FCM tokens.
