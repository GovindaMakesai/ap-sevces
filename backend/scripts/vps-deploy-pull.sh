#!/bin/bash
set -euo pipefail
cd /var/www/ap-services
git pull origin main
pm2 restart ap-api --update-env
sleep 2
pm2 status ap-api
node <<'NODE'
require('dotenv').config({ path: 'backend/.env' });
const p = require('./backend/services/pushNotificationService');
console.log(
  'hooks',
  Object.keys(p)
    .filter((k) => String(k).startsWith('notify'))
    .join(',')
);
console.log('FCM', JSON.stringify(p.getFcmStatus()));
NODE
