/**
 * Signed Play Store .aab — uses Desktop ap-services-upload.jks (see setup-play-upload-key.ps1).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const ps1 = path.join(__dirname, 'build-aab-release.ps1');

if (process.platform === 'win32') {
  const run = spawnSync(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', ps1],
    { stdio: 'inherit', cwd: appDir }
  );
  process.exit(run.status ?? 1);
}

console.error('On Windows run: npm run build:aab');
console.error('Or: powershell -File scripts/setup-play-upload-key.ps1');
process.exit(1);
