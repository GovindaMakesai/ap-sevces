/**
 * Expo config plugin — set Android FLAG_SECURE on MainActivity so screenshots
 * and screen recordings of live video are blacked out (covers WebView + Agora).
 */
const {
  withMainActivity,
  AndroidConfig,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const IMPORT_WINDOW = 'import android.view.WindowManager';
const LOCK_FN = `
  private fun lockScreenCapture() {
    try {
      window.setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
      )
    } catch (_: Throwable) {
    }
  }
`;

function withSecureLiveCapture(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes('FLAG_SECURE') && src.includes('lockScreenCapture')) {
      return cfg;
    }

    if (!src.includes(IMPORT_WINDOW)) {
      src = src.replace(
        /import android\.os\.Bundle\s*\n/,
        `import android.os.Bundle\n${IMPORT_WINDOW}\n`
      );
    }

    if (!src.includes('fun lockScreenCapture')) {
      src = src.replace(
        /class MainActivity\s*:\s*ReactActivity\(\)\s*\{\s*\n/,
        `class MainActivity : ReactActivity() {\n${LOCK_FN}\n`
      );
    }

    if (!src.includes('lockScreenCapture()')) {
      src = src.replace(
        /super\.onCreate\(null\)\s*\n(\s*)\}/,
        `super.onCreate(null)\n$1  lockScreenCapture()\n$1}`
      );
    }

    if (!src.includes('override fun onResume')) {
      src = src.replace(
        /override fun getMainComponentName/,
        `override fun onResume() {\n    super.onResume()\n    lockScreenCapture()\n  }\n\n  override fun onWindowFocusChanged(hasFocus: Boolean) {\n    super.onWindowFocusChanged(hasFocus)\n    if (hasFocus) lockScreenCapture()\n  }\n\n  override fun getMainComponentName`
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withSecureLiveCapture,
  'with-secure-live-capture',
  '1.0.0'
);
