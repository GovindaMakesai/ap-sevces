#!/bin/bash
set -euo pipefail
ls -la /var/www/ap-services/backend/firebase-sa.json
python3 /tmp/vps-fix-firebase-sa.py
pm2 restart ap-api --update-env
sleep 3
cd /var/www/ap-services
node <<'NODE'
require('dotenv').config({ path: 'backend/.env' });
const p = require('./backend/services/pushNotificationService');
console.log('FCM_STATUS', JSON.stringify(p.getFcmStatus()));
NODE
