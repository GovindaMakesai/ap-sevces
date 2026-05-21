/**
 * Starts local frontend (port 5500) + Expo — one command for ap-services-app dev.
 */
const { spawn } = require('child_process');
const path = require('path');

const appDir = path.join(__dirname, '..');
const frontendDir = path.join(appDir, '..', 'frontend');

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    cwd: opts.cwd || appDir,
    shell: true,
    stdio: 'inherit',
    ...opts,
  });
}

console.log('\n📱 AP Services — dev mode');
console.log('   1) Serving NEW UI from frontend/ → http://0.0.0.0:5500');
console.log('   2) Starting Expo (WebView will use your PC LAN IP + port 5500)\n');

/** Dev server: static frontend + /api /auth proxy (fixes login CORS from phone LAN IP). */
const serve = run('node', [path.join(__dirname, 'dev-server.js')]);

let expo;
const startExpo = () => {
  expo = run('npx', ['expo', 'start'], { cwd: appDir });
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
