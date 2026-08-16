const { proxyToBackend } = require('./_proxy');

module.exports = async (req, res) => {
  await proxyToBackend(req, res, '/api/health');
};
