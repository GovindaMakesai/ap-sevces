const svipService = require('../services/svipService');

exports.getHome = async (req, res) => {
  try {
    const data = await svipService.getSvipHome(req.userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getIntro = async (_req, res) => {
  try {
    res.json({ success: true, data: svipService.getSvipIntro() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await svipService.getSettings(req.userId);
    const home = await svipService.getSvipHome(req.userId);
    res.json({
      success: true,
      data: {
        settings,
        level: home.level,
        privileges: home.privileges.filter((p) => p.toggle),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.saveSettings = async (req, res) => {
  try {
    const home = await svipService.getSvipHome(req.userId);
    const incoming = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {};
    const allowed = new Set(home.privileges.filter((p) => p.toggle).map((p) => p.id));
    const existing = await svipService.getSettings(req.userId);
    const filtered = { ...existing };
    Object.keys(incoming).forEach((k) => {
      if (!allowed.has(k)) return;
      const priv = home.privileges.find((p) => p.id === k);
      if (home.level >= priv.minLevel) filtered[k] = Boolean(incoming[k]);
    });
    const settings = await svipService.saveSettings(req.userId, filtered);
    res.json({ success: true, data: { settings } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
