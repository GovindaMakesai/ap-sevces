/**
 * Expo config plugin — does NOT set FLAG_SECURE app-wide.
 * Screenshot blocking is applied only inside LiveRoomScreen (live + party)
 * via expo-screen-capture, and cleared on leave / app start.
 */
const { createRunOncePlugin } = require('@expo/config-plugins');

function withSecureLiveCapture(config) {
  return config;
}

module.exports = createRunOncePlugin(
  withSecureLiveCapture,
  'with-secure-live-capture',
  '2.1.0'
);
