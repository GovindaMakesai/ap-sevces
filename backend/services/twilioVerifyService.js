/**
 * Twilio Verify — OTP lifecycle managed by Twilio (no local OTP storage).
 * Credentials are read from environment variables only.
 */

let client;

function isConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_API_KEY_SID &&
      process.env.TWILIO_API_KEY_SECRET &&
      process.env.TWILIO_VERIFY_SERVICE_SID
  );
}

function getClient() {
  if (!isConfigured()) {
    const err = new Error('SMS login is not configured on the server');
    err.status = 503;
    err.code = 'TWILIO_NOT_CONFIGURED';
    throw err;
  }
  if (!client) {
    const twilio = require('twilio');
    client = twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_KEY_SECRET, {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
    });
  }
  return client;
}

function mapTwilioError(err) {
  const code = err?.code || err?.status;
  const status = Number(err?.status) || 400;
  if (code === 60200 || code === 21211) {
    return { status: 400, message: 'Invalid phone number' };
  }
  if (code === 60202 || code === 60203) {
    return { status: 429, message: 'Too many attempts. Please wait and try again.' };
  }
  if (code === 20404) {
    return { status: 400, message: 'Verification expired. Request a new code.' };
  }
  if (status === 429) {
    return { status: 429, message: 'Too many SMS requests. Please try again later.' };
  }
  return { status: 502, message: 'Could not send verification code. Please try again.' };
}

async function sendVerification(phoneE164) {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  try {
    const verification = await getClient().verify.v2
      .services(serviceSid)
      .verifications.create({ to: phoneE164, channel: 'sms' });
    return { status: verification.status || 'pending' };
  } catch (err) {
    const mapped = mapTwilioError(err);
    const e = new Error(mapped.message);
    e.status = mapped.status;
    throw e;
  }
}

async function checkVerification(phoneE164, code) {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const otp = String(code || '').trim();
  if (!/^\d{4,8}$/.test(otp)) {
    const e = new Error('Enter the verification code');
    e.status = 400;
    throw e;
  }
  try {
    const check = await getClient().verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to: phoneE164, code: otp });
    if (check.status === 'approved') return { approved: true };
    const e = new Error('Incorrect verification code');
    e.status = 401;
    throw e;
  } catch (err) {
    if (err.status) throw err;
    const mapped = mapTwilioError(err);
    if (mapped.status === 400 && mapped.message.includes('expired')) {
      const e = new Error('Verification code expired. Request a new code.');
      e.status = 400;
      throw e;
    }
    const e = new Error(mapped.message || 'Verification failed');
    e.status = mapped.status || 401;
    throw e;
  }
}

module.exports = { isConfigured, sendVerification, checkVerification };
