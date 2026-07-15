const walletService = require('../services/walletService');
const transactionService = require('../services/transactionService');
const giftService = require('../services/giftService');
const auditLogService = require('../services/auditLogService');

exports.getBalance = async (req, res) => {
  try {
    const balance = await walletService.getBalance(req.userId);
    const settings = await walletService.getWalletSettings();
    let gift_inventory_coins = 0;
    let sell_inventory_coins = 0;
    let is_coin_seller = false;
    try {
      const userRes = await require('../config/database').query(
        `SELECT role FROM users WHERE id = $1`,
        [req.userId]
      );
      const role = userRes.rows[0]?.role;
      const coinSellerService = require('../services/coinSellerService');
      const profile = await coinSellerService.getProfile(req.userId);
      if (profile) {
        gift_inventory_coins = Number(profile.gift_inventory_coins || 0);
        sell_inventory_coins = Number(profile.inventory_coins || 0);
      }
      /* Coin sellers (role or active seller profile) gift from gift stock */
      if (
        role === 'coin_seller' ||
        (profile && profile.is_active) ||
        (['admin', 'super_admin', 'founder', 'ceo'].includes(role) && profile?.is_active)
      ) {
        is_coin_seller = true;
      }
    } catch (_e) {
      /* ignore */
    }
    /* Sellers gift only from gift stock; normal users gift from wallet coins */
    const giftable = is_coin_seller
      ? gift_inventory_coins
      : Number(balance.coin_balance || 0);
    res.json({
      success: true,
      data: {
        ...balance,
        settings,
        is_coin_seller,
        gift_inventory_coins,
        sell_inventory_coins,
        inventory_coins: sell_inventory_coins,
        giftable_coins: giftable,
        sellable_coins: sell_inventory_coins + Number(balance.coin_balance || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getWalletSettings = async (_req, res) => {
  try {
    const settings = await walletService.getWalletSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const rows = await transactionService.listTransactions(req.userId, { limit, offset });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRecharges = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const rows = await transactionService.listUserRecharges(req.userId, { limit });
    const settings = await walletService.getWalletSettings();
    const rate = settings.coins_per_inr || 10;
    const data = rows.map((r) => ({
      ...r,
      estimated_coins:
        r.payment_status === 'approved' && r.coins_credited != null
          ? Number(r.coins_credited)
          : Math.floor(Number(r.amount_inr) * rate),
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getWithdrawals = async (req, res) => {
  try {
    const rows = await transactionService.listWithdrawals(req.userId);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const fileAssetService = require('../services/fileAssetService');

exports.requestWithdraw = async (req, res) => {
  try {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid withdrawal amount required' });
    }
    let qr_image_url = null;
    let qr_asset_id = null;
    if (req.file) {
      const asset = await fileAssetService.registerPrivateFile({
        ownerId: req.userId,
        category: 'withdrawal',
        tempPath: req.file.path,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        sizeBytes: req.file.size,
      });
      qr_asset_id = asset.id;
      qr_image_url = fileAssetService.buildSignedUrl(asset.id, 86400 * 7);
    } else if (req.body.qr_image_url) {
      return res.status(400).json({
        success: false,
        message: 'QR image must be uploaded as a file',
      });
    }
    const withdrawal = await walletService.reserveWithdrawal(req.userId, amount, {
      qr_image_url,
      qr_asset_id,
      method: 'qr_upi',
    });

    try {
      await require('../services/adminNotificationService').notifyAllAdmins({
        type: 'withdrawal',
        title: 'New withdrawal request',
        message: `User requested withdrawal of ${amount.toLocaleString()} points — review in Admin → Withdrawals.`,
        data: { withdrawal_id: withdrawal.id },
        excludeUserIds: [req.userId],
      });
    } catch (_notifyErr) {
      /* non-fatal */
    }

    const systemMessageService = require('../services/systemMessageService');
    await systemMessageService.notifyWithdrawalSubmitted(req.userId, {
      amount,
      amountInr: withdrawal.amount_inr,
    });

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted for admin review',
      data: transactionService.enrichWithdrawalQr(withdrawal),
    });
  } catch (err) {
    const code = err.code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
};

/** Points → NR coins for any user (not coin-seller inventory). */
exports.exchangePoints = async (req, res) => {
  try {
    const points = parseInt(req.body.points || req.body.amount, 10);
    const data = await walletService.exchangePointsToCoins(req.userId, points);
    res.json({
      success: true,
      message: `Exchanged ${data.points.toLocaleString()} points for ${data.coinsOut.toLocaleString()} coins`,
      data,
    });
  } catch (err) {
    const code = err.code === 'INSUFFICIENT_BALANCE' ? 400 : 400;
    res.status(code).json({ success: false, message: err.message });
  }
};

exports.getWithdrawal = async (req, res) => {
  try {
    const row = await transactionService.getWithdrawalById(req.params.id, req.userId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.confirmWithdrawal = async (req, res) => {
  try {
    const row = await transactionService.confirmWithdrawalReceipt(req.params.id, req.userId);
    res.json({ success: true, message: 'Payment receipt confirmed', data: row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.submitRecharge = async (req, res) => {
  try {
    const amount_inr = parseFloat(req.body.amount_inr);
    const payment_method = req.body.payment_method;
    const transaction_id = req.body.transaction_id;
    let payment_proof_asset_id = null;
    if (req.file) {
      const fileAssetService = require('../services/fileAssetService');
      const asset = await fileAssetService.registerPrivateFile({
        ownerId: req.userId,
        category: 'recharge',
        tempPath: req.file.path,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        sizeBytes: req.file.size,
      });
      payment_proof_asset_id = asset.id;
    }
    const recharge = await transactionService.createRechargeRequest(req.userId, {
      amount_inr,
      payment_method,
      transaction_id,
      payment_proof_asset_id,
    });
    res.status(201).json({
      success: true,
      message: 'Recharge submitted for admin verification',
      data: recharge,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.sendGift = async (req, res) => {
  try {
    const { receiver_id, receiverId, gift_type, giftType, coin_amount, coinAmount, live_room_id, liveRoomId } =
      req.body || {};
    const receiver = receiver_id || receiverId;
    const coins = parseInt(coin_amount || coinAmount, 10);
    const type = gift_type || giftType || 'gift';
    const roomId = live_room_id || liveRoomId || null;

    if (!receiver) {
      return res.status(400).json({ success: false, message: 'receiver_id is required' });
    }
    if (!coins || coins <= 0) {
      return res.status(400).json({ success: false, message: 'coin_amount must be positive' });
    }

    const result = await giftService.sendGift({
      senderId: req.userId,
      receiverId: receiver,
      liveRoomId: roomId,
      giftType: type,
      coinAmount: coins,
      qty: parseInt(req.body?.qty || req.body?.quantity || 1, 10) || 1,
    });

    const walletBal = await walletService.getBalance(req.userId);
    let gift_inventory_coins = Number(result.sender_balance?.gift_inventory_coins || 0);
    let sell_inventory_coins = 0;
    let is_coin_seller = false;
    try {
      const coinSellerService = require('../services/coinSellerService');
      const profile = await coinSellerService.getProfile(req.userId);
      if (profile) {
        is_coin_seller = true;
        gift_inventory_coins = Number(profile.gift_inventory_coins || 0);
        sell_inventory_coins = Number(profile.inventory_coins || 0);
      }
    } catch (_e) {
      /* ignore */
    }
    const balance = {
      ...walletBal,
      is_coin_seller,
      gift_inventory_coins,
      sell_inventory_coins,
      inventory_coins: sell_inventory_coins,
      giftable_coins: is_coin_seller
        ? gift_inventory_coins
        : Number(walletBal.coin_balance || 0),
      sellable_coins: sell_inventory_coins + Number(walletBal.coin_balance || 0),
    };
    res.json({ success: true, data: { ...result, balance } });
  } catch (err) {
    const code = err.code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
};

exports.listPendingRecharges = async (_req, res) => {
  try {
    const rows = await transactionService.listPendingRecharges();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const adminPaymentService = require('../services/adminPaymentService');

exports.listPendingPayments = async (_req, res) => {
  try {
    const rows = await adminPaymentService.listPendingPayments();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approvePaymentRequest = async (req, res) => {
  try {
    const result = await adminPaymentService.approvePayment(
      req.params.source,
      req.params.id,
      req.userId,
      req.body.notes
    );
    const isSeller = req.params.source === 'coin_seller_recharges';
    const coins = Number(
      result?.coins_credited ?? result?.package_coins ?? 0
    );
    const message = isSeller
      ? `${coins.toLocaleString()} coins added to seller stock (Coin Seller Center — not Profile wallet)`
      : `${Number(result?.coins_credited || 0).toLocaleString()} coins added to user wallet`;
    await auditLogService.logAdmin(req, 'admin.payment.approve', {
      entity_type: req.params.source || 'payment',
      entity_id: req.params.id,
      metadata: {
        summary: message,
        source: req.params.source,
        coins,
        notes: req.body.notes || null,
      },
    });
    res.json({ success: true, data: result, message });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectPaymentRequest = async (req, res) => {
  try {
    const result = await adminPaymentService.rejectPayment(
      req.params.source,
      req.params.id,
      req.userId,
      req.body.notes || req.body.reason
    );
    await auditLogService.logAdmin(req, 'admin.payment.reject', {
      entity_type: req.params.source || 'payment',
      entity_id: req.params.id,
      metadata: {
        summary: `Rejected ${req.params.source} ${req.params.id}`,
        source: req.params.source,
        notes: req.body.notes || req.body.reason || null,
      },
    });
    res.json({ success: true, data: result, message: 'Payment rejected' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.listPendingWithdrawals = async (_req, res) => {
  try {
    const rows = await transactionService.listPendingWithdrawals();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approveRecharge = async (req, res) => {
  try {
    const result = await transactionService.approveRecharge(req.params.id, req.userId, req.body.notes);
    await auditLogService.logAdmin(req, 'admin.recharge.approve', {
      entity_type: 'recharge',
      entity_id: req.params.id,
      metadata: { summary: `Approved recharge ${req.params.id}`, notes: req.body.notes || null },
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectRecharge = async (req, res) => {
  try {
    const row = await transactionService.rejectRecharge(req.params.id, req.userId, req.body.notes);
    await auditLogService.logAdmin(req, 'admin.recharge.reject', {
      entity_type: 'recharge',
      entity_id: req.params.id,
      metadata: { summary: `Rejected recharge ${req.params.id}`, notes: req.body.notes || null },
    });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.approveWithdrawal = async (req, res) => {
  try {
    const row = await transactionService.markWithdrawalPaid(req.params.id, req.userId, req.body.notes);
    await auditLogService.logAdmin(req, 'admin.withdrawal.approve', {
      entity_type: 'withdrawal',
      entity_id: req.params.id,
      metadata: { summary: `Marked withdrawal paid ${req.params.id}`, notes: req.body.notes || null },
    });
    res.json({ success: true, message: 'Marked as paid — awaiting user confirmation', data: row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAdminWithdrawal = async (req, res) => {
  try {
    const row = await transactionService.getWithdrawalById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.rejectWithdrawal = async (req, res) => {
  try {
    const row = await transactionService.rejectWithdrawal(req.params.id, req.userId, req.body.notes);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
