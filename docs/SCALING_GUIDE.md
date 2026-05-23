# Scaling Guide

## Current State

| Component | Single-instance | Multi-instance ready |
|-----------|-----------------|-------------------|
| REST API | ✅ | ✅ (stateless) |
| PostgreSQL wallet | ✅ | ✅ (row locks) |
| Socket.io live | ✅ | ⚠️ needs Redis adapter |
| Rate limits | In-memory | ⚠️ needs Redis |
| Leaderboard cache | Redis/memory | ✅ |
| Cron jobs | Single process | ⚠️ needs leader election |

## Horizontal Scaling Steps

### 1. Redis (required)

```env
REDIS_URL=redis://your-redis:6379
```

Enables: leaderboard cache, distributed rate limits, future socket adapter.

### 2. Socket.io Redis Adapter

```bash
npm install @socket.io/redis-adapter
```

In `server.js` (TODO):

```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const { getClient } = require('./lib/redis');
const pub = await getClient();
const sub = pub.duplicate();
io.adapter(createAdapter(pub, sub));
```

### 3. Database

- Connection pool: default `pg` pool (~10 connections per instance)
- Add PgBouncer for >5 API instances
- Index hot paths: `wallet_transactions(user_id, created_at)`, `gift_transactions(receiver_id)`

### 4. Job Queue (recommended at scale)

Replace node-cron with BullMQ for:
- Leaderboard full refresh
- Agency commission settlement
- Contest finalization

### 5. Read Replicas

Route leaderboard/analytics reads to replica connection.

## Capacity Estimates

| Config | Concurrent live users | Notes |
|--------|----------------------|-------|
| 1× API (2 vCPU, 4GB), no Redis | 1,500–2,500 | Single region |
| 2× API + Redis adapter | 5,000–8,000 | Depends on gift/chat rate |
| 4× API + Redis + PgBouncer | 15,000–25,000 | PK + gift heavy load |

## Bottlenecks

1. **Gift transactions** — multi-table TX per gift; batch analytics async
2. **Live chat** — DB insert per message; move hot chat to Redis with periodic flush
3. **Leaderboard refresh** — every 5 min full rank recompute; partition by period
4. **Webhook processing** — must stay synchronous for idempotency; use queue for side effects

## Monitoring Checklist

- DB connection pool saturation
- Redis memory / hit rate
- Socket connection count per instance
- Gift TX latency p95
- Cron job failure logs
