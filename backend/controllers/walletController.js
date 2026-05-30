const walletService = require('../services/walletService');
const transactionService = require('../services/transactionService');
const giftService = require('../services/giftService');

exports.getBalance = async (req, res) => {
  try {
    const balance = await walletService.getBalance(req.userId);
    const settings = await walletService.getWalletSettings();
    res.json({ success: true, data: { ...balance, settings } });
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

exports.getWithdrawals = async (req, res) => {
  try {
    const rows = await transactionService.listWithdrawals(req.userId);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.requestWithdraw = async (req, res) => {
  try {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid withdrawal amount required' });
    }
    let qr_image_url = req.body.qr_image_url;
    if (req.file) {
      qr_image_url = `/uploads/${req.file.filename}`;
    }
    const withdrawal = await walletService.reserveWithdrawal(req.userId, amount, {
      qr_image_url,
      method: 'qr_upi',
    });
    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted for admin review',
      data: withdrawal,
    });
  } catch (err) {
    const code = err.code === 'INSUFFICIENT_BALANCE' ? 400 : 500;
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
    const { amount_inr, payment_method, transaction_id } = req.body || {};
    const recharge = await transactionService.createRechargeRequest(req.userId, {
      amount_inr: parseFloat(amount_inr),
      payment_method,
      transaction_id,
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
    });

    const balance = await walletService.getBalance(req.userId);
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
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.rejectRecharge = async (req, res) => {
  try {
    const row = await transactionService.rejectRecharge(req.params.id, req.userId, req.body.notes);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.approveWithdrawal = async (req, res) => {
  try {
    const row = await transactionService.markWithdrawalPaid(req.params.id, req.userId, req.body.notes);
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
