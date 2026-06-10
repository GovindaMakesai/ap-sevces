/**
 * EAS APK build — uploads ap-services-app directly (monorepo-safe).
 * Root .gitignore/easignore can exclude the whole app folder when using git archive;
 * EAS_NO_VCS uploads this directory as-is.
 */
const { spawnSync } = require('child_process');

process.env.EAS_NO_VCS = '1';
process.env.EAS_SKIP_AUTO_FINGERPRINT = '1';

const result = spawnSync(
  'npx',
  ['eas', 'build', '--platform', 'android', '--profile', 'preview', '--non-interactive'],
  { stdio: 'inherit', shell: true, env: process.env }
);

process.exit(result.status ?? 1);
