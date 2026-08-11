require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const { signAccessToken } = require('../services/authTokenService');

const email = process.argv[2] || 'developer.govinda00@gmail.com';
const API = (process.env.API_BASE || 'https://api.apservices.in/api').replace(/\/$/, '');

(async () => {
  const u = (
    await db.query(
      `SELECT id, display_id, email, role, first_name FROM users WHERE lower(email)=lower($1)`,
      [email]
    )
  ).rows[0];
  if (!u) throw new Error('user not found');
  const access = signAccessToken(u);

  const diag = await fetch(`${API}/push/diagnostics`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  console.log('diagnostics', diag.status, await diag.text());

  const test = await fetch(`${API}/push/test`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
    },
  });
  console.log('test', test.status, await test.text());
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
