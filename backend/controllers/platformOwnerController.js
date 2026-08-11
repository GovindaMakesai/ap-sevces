const agoraConfigAdminService = require('../services/agoraConfigAdminService');
const walletService = require('../services/walletService');
const auditLogService = require('../services/auditLogService');
const db = require('../config/database');
const { PLATFORM_OWNER_EMAIL } = require('../middleware/platformOwner');

async function getAgoraConfig(req, res) {
  try {
    res.json({
      success: true,
      data: {
        ...agoraConfigAdminService.getAdminAgoraConfig(),
        owner_email: PLATFORM_OWNER_EMAIL,
      },
    });
  } catch (e) {
    console.error('[platform-owner] getAgoraConfig', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load Agora config' });
  }
}

async function updateAgoraConfig(req, res) {
  try {
    const { app_id, appId, app_certificate, appCertificate, primary_certificate } = req.body || {};
    const data = agoraConfigAdminService.updateAgoraCredentials({
      appId: app_id || appId,
      appCertificate: app_certificate || appCertificate || primary_certificate,
    });
    await auditLogService.logAdmin(req, 'admin.agora.update', {
      entity_type: 'agora',
      entity_id: data.app_id,
      metadata: {
        summary: `Updated Agora App ID to ${data.app_id}`,
        app_id: data.app_id,
      },
    });
    res.json({
      success: true,
      message: 'Agora credentials updated — live voice will use the new App ID immediately',
      data,
    });
  } catch (e) {
    const status = e.code === 'INVALID_APP_ID' || e.code === 'INVALID_CERTIFICATE' ? 400 : 500;
    console.error('[platform-owner] updateAgoraConfig', e);
    res.status(status).json({ success: false, message: e.message || 'Failed to update Agora config' });
  }
}

async function setUserWallet(req, res) {
  try {
    const { userId } = req.params;
    const { coin_balance, star_balance, coins, points } = req.body || {};
    const user = await db.query(
      `SELECT id, email, display_id, first_name, last_name FROM users WHERE id = $1`,
      [userId]
    );
    if (!user.rows[0]) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const before = await walletService.getBalance(userId);
    const updated = await walletService.setWalletBalances(
      userId,
      {
        coin_balance: coin_balance !== undefined ? coin_balance : coins,
        star_balance: star_balance !== undefined ? star_balance : points,
      },
      { actor_id: req.userId }
    );
    const u = user.rows[0];
    await auditLogService.logAdmin(req, 'admin.wallet.set_balance', {
      entity_type: 'user',
      entity_id: userId,
      metadata: {
        summary: `Set wallet for ${u.email || u.display_id}: coins ${before.coin_balance}→${updated.coin_balance}, points ${before.star_balance}→${updated.star_balance}`,
        before,
        after: updated,
        target_email: u.email,
        target_display_id: u.display_id,
      },
    });
    res.json({
      success: true,
      message: 'Wallet updated',
      data: {
        user: u,
        before,
        wallet: updated,
      },
    });
  } catch (e) {
    console.error('[platform-owner] setUserWallet', e);
    res.status(400).json({ success: false, message: e.message || 'Failed to update wallet' });
  }
}

module.exports = {
  getAgoraConfig,
  updateAgoraConfig,
  setUserWallet,
};
