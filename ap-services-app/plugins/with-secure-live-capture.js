/**
 * Expo config plugin — intentionally does NOT set FLAG_SECURE app-wide.
 * Screenshot / recording blocking is applied only on live/party URLs via
 * expo-screen-capture in App.js (preventScreenCaptureAsync / allowScreenCaptureAsync).
 */
const { createRunOncePlugin } = require('@expo/config-plugins');

function withSecureLiveCapture(config) {
  return config;
}

module.exports = createRunOncePlugin(
  withSecureLiveCapture,
  'with-secure-live-capture',
  '2.0.0'
);
