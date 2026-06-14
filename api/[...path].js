const { proxyToBackend } = require('./_proxy');

module.exports = async (req, res) => {
  const parts = req.query.path;
  const seg = Array.isArray(parts) ? parts.join('/') : String(parts || '');
  await proxyToBackend(req, res, `/api/${seg}`);
};
