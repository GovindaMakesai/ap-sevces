# Socket Architecture

## Stack

- **Socket.io** on same HTTP server as Express
- JWT auth middleware on connection (`auth.token` or `query.token`)
- Room naming: `live:{channel}`

## Live Socket (`backend/socket/liveSocket.js`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `live:join` | C→S | Host or join room; persists to DB |
| `live:state` | S→C | Full room snapshot |
| `live:chat` | C→S→all | Chat message (rate limited) |
| `live:gift` | C→S→all | Server-side gift debit |
| `live:mute` | C→S | Persist `is_muted` |
| `live:leave` | C→S | Leave room |
| `live:end` | C→S | Host ends room |
| `live:viewer_count` | S→all | Viewer updates |
| `live:ended` | S→all | Room terminated |

### Rate Limits (in-memory per socket)

- Chat: 20 / 10s
- Gifts: 15 / 10s
- Redis-backed limits: TODO for multi-instance

## PK Socket (`backend/socket/pkSocket.js`)

| Event | Description |
|-------|-------------|
| `pk:start` | Create + start battle, broadcast snapshot |
| `pk:join` | Join team, update participants |
| `pk:score` | Broadcast current scores |
| `pk:end` | End battle, distribute rewards |

PK gift scoring also updates via `giftService` → `pkBattleService.addGiftScore`.

## Auth Payload (JWT)

```json
{ "userId": "uuid", "role": "creator", "first_name": "Name" }
```

Permissions checked server-side via `permissionService.userHasPermission`.

## Scaling Path

1. Set `REDIS_URL`
2. Install `@socket.io/redis-adapter`
3. Attach adapter in `server.js` before registering handlers
4. Move rate limit counters to Redis (`backend/lib/redis.js`)

## Estimated Capacity (single instance)

- ~2,000–5,000 concurrent socket connections (typical 2 vCPU / 4GB)
- Live rooms bottleneck: DB writes on chat/gift — batch or Redis pub/sub recommended above 500 active rooms
