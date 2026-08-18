#!/usr/bin/env bash
# Run once in Render Shell after first successful deploy (DATABASE_URL must be set).
set -euo pipefail
echo "==> Seeding test users..."
npm run db:seed:test
echo "==> Done. Login with customer1.test@apservices.com / password123"
