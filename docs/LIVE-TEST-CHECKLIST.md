# Live Stream Emergency Test Checklist

Run on **HTTPS** (`npm start` in `ap-services-app`). LAN HTTP (`start:lan`) blocks camera/mic publish.

## Setup

| Device | Account | Role |
|--------|---------|------|
| A | Account A | Host |
| B | Account B | Viewer |

## Host (Device A)

1. Sign in as Account A.
2. Explore → **Go Live** (video).
3. Wait for broadcast to start.

### Pass criteria

| Check | Expected |
|-------|----------|
| Socket connected | YES — `window.__liveDebug.events` contains `SOCKET_CONNECTED` |
| Room created | YES — `ROOM_CREATE_SUCCESS` |
| Token | YES — `TOKEN_SUCCESS` with `role: "host"` |
| Agora joined | YES — `AGORA_JOIN_SUCCESS` |
| Publish | YES — `PUBLISH_SUCCESS` |
| HOSTING badge | Visible only after publish |
| `SocialLive.isActuallyLive()` | `true` |

### Console quick check

```javascript
SocialLive.isActuallyLive()
SocialLive.getForensicReport().events.map(e => e.event)
```

## Viewer (Device B)

1. Sign in as Account B (different account).
2. Within 2 minutes, open the **same channel** from Explore live card.

### Pass criteria

| Check | Expected |
|-------|----------|
| Room joined | YES — bottom bar: `Room joined: YES` |
| Agora connected | YES — `Agora connected: YES` |
| Remote users | `> 0` within ~10s of host publish |
| Status text | `Watching live` (only when remote > 0) |
| Before host stream | `Waiting for host stream…` |

### Console quick check

```javascript
SocialLive.isActuallyLive()
document.getElementById('apVDiagRemote')?.textContent
```

## Party (audio)

Repeat with **Start Party** on Device A; Device B joins `party-room.html?channel=...`.

| Check | Host | Viewer |
|-------|------|--------|
| `PUBLISH_SUCCESS` | YES | — |
| Hears host audio | — | YES |

## Fail report template

| Stage | Host A | Viewer B |
|-------|--------|----------|
| SOCKET_CONNECTED | | |
| ROOM_CREATE_SUCCESS | | |
| TOKEN_SUCCESS | | |
| AGORA_JOIN_SUCCESS | | |
| PUBLISH_SUCCESS | | |
| REMOTE_USER_PUBLISHED | | |
| REMOTE_USER_SUBSCRIBED | | |
| Remote count > 0 | N/A | |

Copy `localStorage.getItem('ap_live_forensics')` from either device if a stage fails.
