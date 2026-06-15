const fileAssetService = require('../services/fileAssetService');
const db = require('../config/database');

async function downloadSigned(req, res) {
  try {
    const { id } = req.params;
    const { expires, sig } = req.query;
    const resolved = await fileAssetService.resolveSignedDownload(id, expires, sig);
    if (!resolved) {
      return res.status(403).json({ success: false, message: 'Invalid or expired download link' });
    }

    const asset = resolved.asset;
    const isOwner = req.userId && String(asset.owner_id) === String(req.userId);
    const isAdmin = ['admin', 'super_admin', 'founder', 'ceo'].includes(req.userRole);
    if (!isOwner && !isAdmin && asset.category !== 'public') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.sendFile(resolved.fullPath);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function issueSignedUrl(req, res) {
  try {
    const asset = await fileAssetService.getFileAsset(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'File not found' });
    const isOwner = String(asset.owner_id) === String(req.userId);
    const isAdmin = ['admin', 'super_admin', 'founder', 'ceo'].includes(req.userRole);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const ttl = Math.min(parseInt(req.query.ttl, 10) || 300, 3600);
    const url = fileAssetService.buildSignedUrl(asset.id, ttl);
    return res.json({ success: true, data: { url, expires_in: ttl, asset_id: asset.id } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { downloadSigned, issueSignedUrl };
