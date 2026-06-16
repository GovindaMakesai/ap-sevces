/**
 * Expo + production HTTPS WebView (https://api.apservices.in).
 * Required for Live/Party camera & microphone — LAN http:// blocks getUserMedia.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

const appDir = path.join(__dirname, '..');
const EXPO_PORT = Number(process.env.EXPO_DEV_PORT || 8081);

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

console.log('\n📱 AP Services — LIVE mode');
console.log('   WebView → https://api.apservices.in (camera/mic enabled)');
console.log('   For local UI dev only (no camera): npm run start:lan\n');

freePort(EXPO_PORT);

const expo = spawn('npx', ['expo', 'start', '--port', String(EXPO_PORT)], {
  cwd: appDir,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_USE_LAN_WEB: '0' },
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
