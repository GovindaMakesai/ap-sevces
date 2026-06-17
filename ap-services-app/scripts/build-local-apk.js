/**
 * Local Android APK — expo prebuild + Gradle (no EAS cloud).
 * Default: debug APK (install with adb install -r). Pass --release if upload keystore is configured.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const androidDir = path.join(appDir, 'android');
const wantRelease = process.argv.includes('--release');
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');

function run(label, cmd, args, opts = {}) {
  console.log(`\n[build-local-apk] ${label}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    cwd: opts.cwd || appDir,
    env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ...opts.env },
  });
  if (result.status !== 0) {
    console.error(`[build-local-apk] Failed: ${label}`);
    process.exit(result.status || 1);
  }
}

function readProps(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    out[k.trim()] = rest.join('=').trim();
  }
  return out;
}

function hasReleaseSigning() {
  const gradleProps = path.join(androidDir, 'gradle.properties');
  if (fs.existsSync(gradleProps)) {
    const c = fs.readFileSync(gradleProps, 'utf8');
    if (c.includes('MYAPP_UPLOAD_STORE_FILE=') && c.includes('MYAPP_UPLOAD_STORE_PASSWORD=')) {
      return true;
    }
  }
  const local = readProps(path.join(__dirname, 'play-upload.local.properties'));
  return Boolean(local.keystore && local.storePassword);
}

const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

if (!fs.existsSync(gradlew)) {
  run('expo prebuild', 'npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    env: { CI: '1' },
  });
}

if (process.platform === 'win32') {
  run(
    'patch signing',
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'patch-android-signing.ps1')]
  );
}

const useRelease = wantRelease && hasReleaseSigning();
if (wantRelease && !useRelease) {
  console.warn('[build-local-apk] No release keystore found — building debug APK instead.');
  console.warn('  Configure scripts/play-upload.local.properties or run: npm run setup:play-key');
}

const variant = useRelease ? 'Release' : 'Debug';
run(`gradle assemble${variant}`, gradlew, [`assemble${variant}`], { cwd: androidDir });

const apkName = useRelease ? 'app-release.apk' : 'app-debug.apk';
const builtApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', variant.toLowerCase(), apkName);

if (!fs.existsSync(builtApk)) {
  console.error(`[build-local-apk] APK not found at ${builtApk}`);
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(path.join(appDir, 'app.json'), 'utf8'));
const version = appJson.expo?.version || '1.0.0';
const distDir = path.join(appDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outName = useRelease ? `ap-services-${version}-release.apk` : `ap-services-${version}-debug.apk`;
const outFile = path.join(distDir, outName);
fs.copyFileSync(builtApk, outFile);

const desktop = path.join(process.env.USERPROFILE || '', 'OneDrive', 'Desktop', outName);
try {
  fs.copyFileSync(builtApk, desktop);
  console.log(`\n[build-local-apk] SUCCESS`);
  console.log(`  ${outFile}`);
  console.log(`  ${desktop}`);
} catch (_e) {
  console.log(`\n[build-local-apk] SUCCESS`);
  console.log(`  ${outFile}`);
}

console.log(`\nInstall on device: adb install -r "${outFile}"`);
