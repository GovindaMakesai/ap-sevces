# Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+ (recommended for production)
- Optional: Razorpay / Stripe accounts

## Environment Variables

Copy `backend/.env.example` → `backend/.env`:

```env
DATABASE_URL=postgresql://user:pass@host:5432/ap_services
JWT_SECRET=your-long-random-secret-min-32-chars
JWT_EXPIRES_IN=7d
PORT=5000

# Redis (production)
REDIS_URL=redis://localhost:6379

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Optional
MONGODB_URI=
DISABLE_CRON=false
SKIP_DB_SCHEMA_ENSURE=false
LOG_LEVEL=info
```

## Database Setup

```bash
# 1. Base marketplace schema
npm run db:schema

# 2. Phase 1 foundation (wallet, live, RBAC)
npm run db:migrate:foundation

# 3. Phase 2 platform (agency, PK, VIP, payments)
npm run db:migrate:phase2

# Optional seeds
npm run db:seed:test
```

Schema is also applied automatically on server startup.

## Redis Setup

```bash
# Docker
docker run -d --name ap-redis -p 6379:6379 redis:7-alpine

# Set in .env
REDIS_URL=redis://localhost:6379
```

## Payment Webhooks

### Razorpay

1. Dashboard → Webhooks → Add endpoint: `https://your-api.com/api/v1/webhooks/razorpay`
2. Events: `payment.captured`
3. Copy webhook secret → `RAZORPAY_WEBHOOK_SECRET`

### Stripe

1. Dashboard → Developers → Webhooks
2. Endpoint: `https://your-api.com/api/v1/webhooks/stripe`
3. Events: `checkout.session.completed`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

## Start Commands

```bash
npm install
npm start          # production
npm run dev        # nodemon development
```

## Health Check

```bash
curl https://your-api.com/api/health
```

## Test Commands

```bash
npm test
```

## Render / Production Notes

- Use managed PostgreSQL + Redis add-ons
- Set `REDIS_URL` before scaling to 2+ instances
- Webhook routes must receive raw body (already configured in `webhooks.js`)
- Enable HTTPS only for payment webhooks
