/**
 * Expo + production HTTPS WebView (https://api.apservices.in).
 * Required for Live/Party camera & microphone — LAN http:// blocks getUserMedia.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

const appDir = path.join(__dirname, '..');
const EXPO_PORT = Number(process.env.EXPO_DEV_PORT || 8081);

function getLanIp() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

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

const lanIp = getLanIp();
const useTunnel = String(process.env.EXPO_USE_TUNNEL || '') === '1';

console.log('\n📱 AP Services — LIVE mode');
console.log('   WebView → https://api.apservices.in (camera/mic enabled)');
console.log('   For local UI dev only (no camera): npm run start:lan');
if (lanIp && !useTunnel) {
  console.log(`   Expo Go (same Wi-Fi): exp://${lanIp}:${EXPO_PORT}`);
  console.log('   If QR scan fails, type that URL in Expo Go → Enter URL manually');
} else if (useTunnel) {
  console.log('   Using tunnel mode (EXPO_USE_TUNNEL=1) — scan QR when it appears');
} else {
  console.log('   Could not detect LAN IP — set EXPO_USE_TUNNEL=1 if scan fails');
}
console.log('');

freePort(EXPO_PORT);

const expoArgs = ['expo', 'start', '--port', String(EXPO_PORT)];
if (useTunnel) expoArgs.push('--tunnel');
else expoArgs.push('--lan');

const expoEnv = { ...process.env, EXPO_PUBLIC_USE_LAN_WEB: '0' };
if (lanIp && !useTunnel) {
  expoEnv.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
}

const expo = spawn('npx', expoArgs, {
  cwd: appDir,
  shell: true,
  stdio: 'inherit',
  env: expoEnv,
});

expo.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT', () => {
  try {
    expo.kill();
  } catch (_e) {
    /* ignore */
  }
  process.exit(0);
});
