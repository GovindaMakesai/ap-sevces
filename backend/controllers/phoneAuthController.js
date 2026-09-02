const crypto = require('crypto');
const User = require('../models/User');
const { normalizePhoneInput } = require('../lib/phoneNormalize');
const twilioVerify = require('../services/twilioVerifyService');
const { authMeta, respondAuthedJson, createSession } = require('../lib/authRespond');
const { isUserProvidedPhone } = require('../lib/userPhone');

const ACCOUNT_DEACTIVATED_MSG = 'Your account has been deactivated';

function generatePhoneUserPassword() {
  return `phone_${crypto.randomBytes(24).toString('hex')}`;
}

function phoneAuthEmail(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  return `p${digits}@phone.aplive.local`;
}

async function findUserByPhoneVariants(variants) {
  return User.findByPhoneVariants(variants);
}

async function ensurePhoneStoredE164(user, e164) {
  if (!user?.id || user.phone === e164) return user;
  if (!isUserProvidedPhone(user)) return user;
  try {
    return (await User.setPhoneE164(user.id, e164)) || user;
  } catch (_e) {
    return user;
  }
}

async function createPhoneUser(e164, national) {
  const email = phoneAuthEmail(e164);
  const existingEmail = await User.findByEmail(email);
  const finalEmail = existingEmail ? `p${crypto.randomBytes(8).toString('hex')}@phone.aplive.local` : email;
  const tail = String(national || e164).slice(-4);
  return User.create({
    email: finalEmail,
    phone: e164,
    password: generatePhoneUserPassword(),
    first_name: 'User',
    last_name: tail || 'Member',
    role: 'customer',
    phone_provided: true,
  });
}

exports.sendOtp = async (req, res) => {
  try {
    if (!twilioVerify.isConfigured()) {
      return res.status(503).json({ success: false, message: 'Phone login is not available right now' });
    }
    const country = String(req.body?.country || req.body?.countryCode || 'IN').toUpperCase();
    const normalized = normalizePhoneInput(req.body?.phone, country);
    if (!normalized.ok) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    await twilioVerify.sendVerification(normalized.e164);
    return res.json({
      success: true,
      message: 'OTP sent successfully',
      data: { phone: normalized.e164, masked: normalized.masked },
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Could not send OTP',
    });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    if (!twilioVerify.isConfigured()) {
      return res.status(503).json({ success: false, message: 'Phone login is not available right now' });
    }
    const country = String(req.body?.country || req.body?.countryCode || 'IN').toUpperCase();
    const normalized = normalizePhoneInput(req.body?.phone, country);
    if (!normalized.ok) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const code = String(req.body?.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, message: 'Verification code is required' });
    }

    await twilioVerify.checkVerification(normalized.e164, code);

    let user = await findUserByPhoneVariants(normalized.lookupVariants);
    if (user) {
      if (user.is_active === false) {
        return res.status(403).json({ success: false, message: ACCOUNT_DEACTIVATED_MSG });
      }
      user = await ensurePhoneStoredE164(user, normalized.e164);
    } else {
      try {
        const created = await createPhoneUser(normalized.e164, normalized.national);
        user = await User.findById(created.id);
      } catch (createErr) {
        if (createErr.code === '23505') {
          user = await findUserByPhoneVariants(normalized.lookupVariants);
          if (!user) throw createErr;
        } else {
          throw createErr;
        }
      }
    }

    const { accessToken, refreshToken } = await createSession(user, res, authMeta(req));
    res.status(user ? 200 : 201);
    return respondAuthedJson(res, user, 'Login successful', accessToken, refreshToken);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Verification failed',
    });
  }
};
