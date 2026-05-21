/**
 * Serves frontend/ and proxies /api + /auth to Render (optional LAN dev helper).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 5500;
const HOST = '0.0.0.0';
const API_HOST = 'ap-sevces.onrender.com';
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
  const h = { ...reqHeaders, host: API_HOST };
  delete h.connection;
  delete h['content-length'];
  delete h['transfer-encoding'];
  return h;
}

function proxyToApi(req, res) {
  const opts = {
    hostname: API_HOST,
    port: 443,
    path: req.url,
    method: req.method,
    headers: cleanProxyHeaders(req.headers),
  };

  const proxyReq = https.request(opts, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    const origin = req.headers.origin;
    if (origin) {
      headers['access-control-allow-origin'] = origin;
      headers['access-control-allow-credentials'] = 'true';
    }
    headers['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type, Authorization';
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

server.listen(PORT, HOST, () => {
  console.log(`[dev-server] http://${HOST}:${PORT} → frontend + API proxy → ${API_HOST}`);
});

module.exports = server;
