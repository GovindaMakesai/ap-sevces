/**
 * Serves frontend/ and proxies /api, /auth, and /socket.io to production VPS.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const apiConfig = require('../../config/production-api');

const PORT = 5500;
const HOST = '0.0.0.0';
const API_HOST = process.env.AP_API_HOST || new URL(apiConfig.BACKEND_URL).hostname;
const API_PORT = Number(process.env.AP_API_PORT || new URL(apiConfig.BACKEND_URL).port || 5000);
const API_USE_HTTPS = process.env.AP_API_USE_HTTPS === 'true' || apiConfig.BACKEND_URL.startsWith('https:');
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

function cleanProxyHeaders(reqHeaders) {
  const h = { ...reqHeaders, host: API_USE_HTTPS ? API_HOST : `${API_HOST}:${API_PORT}` };
  delete h.connection;
  delete h['content-length'];
  delete h['transfer-encoding'];
  return h;
}

/** Production auth cookies use Domain + Secure — strip for LAN http://IP:5500 */
function rewriteSetCookiesForLocalDev(setCookieHeader) {
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookies.filter(Boolean).map((cookie) =>
    String(cookie)
      .replace(/;\s*Domain=[^;]*/gi, '')
      .replace(/;\s*Secure/gi, '')
      .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
  );
}

function proxyToApi(req, res) {
  const lib = API_USE_HTTPS ? https : http;
  const opts = {
    hostname: API_HOST,
    port: API_USE_HTTPS ? 443 : API_PORT,
    path: req.url,
    method: req.method,
    headers: cleanProxyHeaders(req.headers),
  };

  const proxyReq = lib.request(opts, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    const origin = req.headers.origin;
    if (origin) {
      headers['access-control-allow-origin'] = origin;
      headers['access-control-allow-credentials'] = 'true';
    }
    headers['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, Authorization';
    if (headers['set-cookie']) {
      headers['set-cookie'] = rewriteSetCookiesForLocalDev(headers['set-cookie']);
    }
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[dev-server] proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'API proxy error: ' + err.message }));
  });

  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head) {
  const lib = API_USE_HTTPS ? https : http;
  const opts = {
    hostname: API_HOST,
    port: API_USE_HTTPS ? 443 : API_PORT,
    path: req.url,
    method: req.method,
    headers: cleanProxyHeaders(req.headers),
  };

  const proxyReq = lib.request(opts);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const headerLines = [`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}`];
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headerLines.push(`${key}: ${v}`));
      else headerLines.push(`${key}: ${value}`);
    }
    socket.write(`${headerLines.join('\r\n')}\r\n\r\n`);
    if (proxyHead?.length) proxySocket.write(proxyHead);
    if (head?.length) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on('error', (err) => {
    console.error('[dev-server] websocket proxy error:', err.message);
    socket.destroy();
  });
  proxyReq.end();
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (urlPath === '/') urlPath = '/app-auth.html';
  const filePath = path.normalize(path.join(FRONTEND_DIR, urlPath));
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    });
    res.end();
    return;
  }

  const url = req.url || '/';
  if (url.startsWith('/api/') || url.startsWith('/auth/')) {
    proxyToApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (url.startsWith('/socket.io')) {
    proxyWebSocket(req, socket, head);
    return;
  }
  socket.destroy();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[dev-server] Port ${PORT} is already in use.`);
    console.error('Stop the old server (Ctrl+C in other terminal) or run:');
    console.error(`  netstat -ano | findstr :${PORT}`);
    console.error('  taskkill /PID <pid> /F\n');
  } else {
    console.error('[dev-server] Error:', err.message);
  }
  process.exit(1);
});

const proxyTarget = API_USE_HTTPS ? `https://${API_HOST}` : `http://${API_HOST}:${API_PORT}`;

server.listen(PORT, HOST, () => {
  console.log(`[dev-server] http://${HOST}:${PORT} → frontend + API/socket proxy → ${proxyTarget}`);
});

module.exports = server;
