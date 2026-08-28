/**
 * Local Android APK build for AP Live Service.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const debug = process.argv.includes('--debug');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
if (fs.existsSync(sdk)) {
  process.env.ANDROID_HOME = sdk;
  process.env.ANDROID_SDK_ROOT = sdk;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: cwd || appDir, shell: true, env: process.env });
  if (r.status) process.exit(r.status);
}

if (!fs.existsSync(path.join(appDir, 'android'))) {
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean']);
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const task = debug ? 'assembleDebug' : 'assembleRelease';
run(gradlew, [task, '--no-daemon'], path.join(appDir, 'android'));

const apk = debug
  ? path.join(appDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
  : path.join(appDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

if (!fs.existsSync(apk)) {
  console.error('APK not found at', apk);
  process.exit(1);
}
const outDir = path.join(appDir, 'apk');
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, debug ? 'ap-live-service-debug.apk' : 'ap-live-service-release.apk');
fs.copyFileSync(apk, dest);
console.log('\nAPK_PATH=' + dest);
