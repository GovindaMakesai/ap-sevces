/**
 * Standalone phone-test APK — local Gradle build off OneDrive (C:\aps-build).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const ps1 = path.join(__dirname, 'build-apk-local.ps1');
const wantDebug = process.argv.includes('--debug');
const args = ['-ExecutionPolicy', 'Bypass', '-File', ps1];
if (wantDebug) args.push('-Debug');

if (process.platform === 'win32') {
  const run = spawnSync('powershell', args, { stdio: 'inherit', cwd: appDir });
  process.exit(run.status ?? 1);
}

console.error('Local APK build script requires Windows. Try: npm run build:local');
process.exit(1);
