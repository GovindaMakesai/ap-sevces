const cosmeticService = require('../services/cosmeticService');

exports.listProducts = async (req, res) => {
  try {
    const category = req.query.category || null;
    const data = await cosmeticService.listProducts({ category, status: 'ACTIVE' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const data = await cosmeticService.getProductById(req.params.id);
    if (!data || data.status !== 'ACTIVE') {
      return res.status(404).json({ success: false, message: 'Cosmetic not found' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const category = req.query.category || null;
    const items = await cosmeticService.listUserInventory(req.userId, { category });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getEquipped = async (req, res) => {
  try {
    const cosmetics = await cosmeticService.getEquippedCosmetics(req.userId);
    res.json({ success: true, data: { cosmetics } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getEquippedForUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const cosmetics = await cosmeticService.getEquippedCosmetics(userId);
    res.json({ success: true, data: { cosmetics } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.purchase = async (req, res) => {
  try {
    const cosmeticId = req.body.cosmetic_id || req.body.cosmeticId;
    const variantId = req.body.variant_id || req.body.variantId;
    if (!cosmeticId || !variantId) {
      return res.status(400).json({ success: false, message: 'cosmetic_id and variant_id required' });
    }
    const result = await cosmeticService.purchase(req.userId, cosmeticId, variantId);
    res.json({
      success: true,
      data: {
        ownership: result.ownership,
        coinBalance: result.coinBalance,
        balance: { coin_balance: result.coinBalance },
      },
      message: 'Purchase successful',
    });
  } catch (err) {
    const msg = err.message || 'Purchase failed';
    const status = msg.includes('Insufficient') ? 400 : 400;
    res.status(status).json({ success: false, message: msg });
  }
};

exports.equip = async (req, res) => {
  try {
    const ownershipId = req.body.ownership_id || req.body.ownershipId;
    if (!ownershipId) {
      return res.status(400).json({ success: false, message: 'ownership_id required' });
    }
    const cosmetics = await cosmeticService.equip(req.userId, ownershipId);
    res.json({ success: true, data: { cosmetics }, message: 'Equipped' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.unequip = async (req, res) => {
  try {
    const ownershipId = req.body.ownership_id || req.body.ownershipId;
    if (!ownershipId) {
      return res.status(400).json({ success: false, message: 'ownership_id required' });
    }
    const cosmetics = await cosmeticService.unequip(req.userId, ownershipId);
    res.json({ success: true, data: { cosmetics }, message: 'Unequipped' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* Admin */
exports.adminList = async (req, res) => {
  try {
    const status = req.query.status;
    const data = await cosmeticService.listProducts({
      category: req.query.category || null,
      status: status !== undefined && status !== '' ? status : null,
      includeVariants: true,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.adminGet = async (req, res) => {
  try {
    const data = await cosmeticService.getProductById(req.params.id, { includeInactiveVariants: true });
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.adminCreate = async (req, res) => {
  try {
    const data = await cosmeticService.createProduct(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const data = await cosmeticService.updateProduct(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.adminUpsertVariant = async (req, res) => {
  try {
    const data = await cosmeticService.upsertVariant(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.adminDeleteVariant = async (req, res) => {
  try {
    await cosmeticService.deleteVariant(req.params.variantId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
