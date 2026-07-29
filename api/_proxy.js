/** Shared proxy — forwards Vercel /api/* and /auth/* to production API (HTTPS). */
const BACKEND = (
  process.env.BACKEND_URL ||
  process.env.API_URL?.replace(/\/api\/?$/, '') ||
  'https://api.apservices.in'
).replace(/\/$/, '');

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

async function proxyToBackend(req, res, backendPath) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  /* Catch-all query may include path= segments — strip those from search forwarded upstream */
  const params = new URLSearchParams(url.search);
  params.delete('path');
  const qs = params.toString();
  const target = `${BACKEND}${backendPath}${qs ? `?${qs}` : ''}`;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    const key = k.toLowerCase();
    if (!v || key === 'host' || key === 'connection' || key === 'content-length') continue;
    headers[k] = Array.isArray(v) ? v.join(', ') : v;
  }

  try {
    const body = await readBody(req);
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const loc = upstream.headers.get('location');
      if (loc) {
        res.statusCode = upstream.status;
        res.setHeader('location', loc);
        res.end();
        return;
      }
    }

    res.statusCode = upstream.status;
    upstream.headers.forEach((val, key) => {
      const lk = key.toLowerCase();
      if (lk !== 'transfer-encoding' && lk !== 'connection') {
        res.setHeader(key, val);
      }
    });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error('[vercel-proxy]', target, err.message);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        message: err.message,
        target,
        proxy: 'vercel-serverless',
      })
    );
  }
}

module.exports = { proxyToBackend, BACKEND };
