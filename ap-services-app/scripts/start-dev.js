/**
 * Starts local frontend (port 5500) + Expo — one command for ap-services-app dev.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

const appDir = path.join(__dirname, '..');
const DEV_PORT = 5500;
const EXPO_PORT = Number(process.env.EXPO_DEV_PORT || 8081);

/** Free a TCP port on Windows (kill listening PID). */
function freePort(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`   Freed port ${port} (stopped PID ${pid})`);
      } catch (_e) {
        /* ignore */
      }
    }
  } catch (_e) {
    /* port not in use */
  }
}

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: opts.cwd || appDir,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...(opts.env || {}) },
    ...opts,
  });
}

console.log('\n📱 AP Services — dev mode');
freePort(DEV_PORT);
freePort(EXPO_PORT);
console.log(`   1) Serving NEW UI from frontend/ → http://0.0.0.0:${DEV_PORT}`);
console.log('   2) Starting Expo (WebView will use your PC LAN IP + port 5500)\n');

// WebView loads local frontend (proxies API to production). Without this, Expo still hits api.apservices.in.
process.env.EXPO_PUBLIC_USE_LAN_WEB = '1';

const serve = run('node', [path.join(__dirname, 'dev-server.js')]);

serve.on('error', (err) => {
  console.error('\n❌ Dev server failed:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`   Port ${DEV_PORT} is busy. Close other terminals or run:`);
    console.error(`   netstat -ano | findstr :${DEV_PORT}`);
    console.error('   taskkill /PID <pid> /F\n');
  }
  process.exit(1);
});

let expo;
const startExpo = () => {
  expo = run('npx', ['expo', 'start', '--port', String(EXPO_PORT)], {
    cwd: appDir,
    env: { EXPO_PUBLIC_USE_LAN_WEB: '1' },
  });
  expo.on('exit', (code) => {
    try {
      serve.kill();
    } catch (_e) {
      /* ignore */
    }
    process.exit(code ?? 0);
  });
};

setTimeout(startExpo, 2500);

const cleanup = () => {
  try {
    serve.kill();
  } catch (_e) {
    /* ignore */
  }
  try {
    expo?.kill();
  } catch (_e) {
    /* ignore */
  }
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
