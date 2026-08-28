const { createRunOncePlugin } = require('@expo/config-plugins');

function withReleaseSigning(config) {
  return config;
}

module.exports = createRunOncePlugin(withReleaseSigning, 'with-release-signing', '1.0.0');
