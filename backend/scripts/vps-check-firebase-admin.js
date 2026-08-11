const admin = require('firebase-admin');
console.log('keys', Object.keys(admin));
console.log('credential', typeof admin.credential, admin.credential && Object.keys(admin.credential));
console.log('apps', admin.apps);
console.log('version', require('firebase-admin/package.json').version);
try {
  require('dotenv').config({ path: 'backend/.env' });
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  console.log('sa ok', sa.project_id, sa.client_email, 'pk starts', String(sa.private_key).slice(0, 30));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  console.log('INIT_OK', admin.app().name);
} catch (e) {
  console.error('INIT_FAIL', e.message);
  console.error(e.stack);
}
