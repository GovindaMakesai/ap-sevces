/**
 * Diagnose live/party media path (socket + Agora tokens + RTC join).
 * Usage: node backend/scripts/debug-live-media.js [apiBase]
 */
const http = require('http');
const https = require('https');
const { io } = require('socket.io-client');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const isHttps = BASE.startsWith('https');
const lib = isHttps ? https : http;
const origin = BASE.replace(/\/api\/?$/, '');
const apiPath = BASE.includes('/api') ? '' : '/api';

function request(method, path, { token, body } = {}) {
  const url = new URL(origin + apiPath + path);
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (_e) {
            json = { raw: data.slice(0, 200) };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login() {
  const emails = ['customer1.test@apservices.com', process.env.SMOKE_EMAIL].filter(Boolean);
  const password = process.env.SMOKE_PASSWORD || 'password123';
  for (const email of emails) {
    const res = await request('POST', '/auth/login', { body: { email, password } });
    const token =
      res.json?.data?.accessToken || res.json?.token || res.json?.accessToken || res.json?.data?.token;
    const user = res.json?.data?.user || res.json?.user || {};
    if (token) return { token, user, email };
  }
  throw new Error('Login failed');
}

function joinRoom(token, { channel, isHost, type = 'live', name }) {
  return new Promise((resolve, reject) => {
    const socket = io(origin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 12000,
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${name} socket timeout`));
    }, 15000);
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(new Error(`${name} connect_error: ${err.message}`));
    });
    socket.on('connect', () => {
      socket.emit(
        'live:join',
        { channel, type, displayName: name, isHost },
        (res) => {
          clearTimeout(timer);
          if (!res?.ok) {
            socket.close();
            reject(new Error(`${name} join failed: ${res?.message || 'unknown'}`));
            return;
          }
          resolve({ socket, res });
        }
      );
    });
  });
}

async function main() {
  console.log('=== LIVE MEDIA DIAGNOSE ===');
  console.log('Target:', origin);

  const cfg = await request('GET', '/live/agora/config');
  console.log('Agora config:', cfg.status, cfg.json);

  const { token, user, email } = await login();
  console.log('Login OK:', email, user.id);

  const channel = `diag-live-${Date.now().toString(36)}`;
  const hostJoin = await joinRoom(token, {
    channel,
    isHost: true,
    name: 'Diag Host',
    type: 'live',
  });
  console.log('live:join:', {
    ok: hostJoin.res.ok,
    isHost: hostJoin.res.isHost,
    hostId: hostJoin.res.state?.hostId,
  });

  const tok = await request('POST', '/live/agora/token', {
    token,
    body: { channel, role: 'host' },
  });
  console.log('Agora publisher token:', tok.status, {
    mode: tok.json?.mode,
    hasToken: Boolean(tok.json?.token),
    appId: tok.json?.appId ? String(tok.json.appId).slice(0, 8) + '…' : null,
    message: tok.json?.message,
  });

  if (!tok.json?.token) {
    console.log('\nRESULT: FAIL — cannot get Agora token');
    hostJoin.socket.close();
    process.exit(1);
  }

  // Try RTC join in browser-like way is not available in Node without SDK.
  // Print clear billing guidance if we already know the pattern.
  console.log('\nRESULT: API + socket + token OK');
  console.log('If clients still have no audio/video, Agora account is likely suspended (billing).');
  console.log('Check Agora Console → Billing: Available Balance must be >= $0.');

  hostJoin.socket.emit('live:end', { channel }, () => {});
  hostJoin.socket.close();
}

main().catch((e) => {
  console.error('DIAG FAIL:', e.message);
  process.exit(1);
});
