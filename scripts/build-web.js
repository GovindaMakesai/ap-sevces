/**
 * Static web "build" check for Vercel deploys: verify key frontend files exist.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const frontend = path.join(root, 'frontend');

const required = [
    'index.html',
    'app.js',
    'styles.css',
    'dashboard-mobile.css',
    'admin-mobile-app.css',
    'admin-shared.css',
    'auth-pages.css',
    'login.html',
    'register.html',
    'customer-dashboard.html',
    'worker-dashboard.html',
    'services.html',
    'booking.html',
    'become-a-pro.html',
    'points.html',
    'withdraw.html',
    'withdraw-details.html',
    'withdraw-notices.html',
    'social-withdraw.css',
    'social-wallet.js'
];

let failed = false;
for (const f of required) {
    const p = path.join(frontend, f);
    if (!fs.existsSync(p)) {
        console.error(`Missing required file: frontend/${f}`);
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}

console.log('Web build check passed:', required.length, 'files present in frontend/');
