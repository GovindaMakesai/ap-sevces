// backend/controllers/authController.js
const User = require('../models/User');
const Worker = require('../models/Worker');
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const mapExperienceRangeToYears = (range) => {
    const table = { '0-1': 0, '1-3': 2, '3-5': 4, '5-10': 7, '10+': 12 };
    return table[range] !== undefined ? table[range] : 1;
};

const generateToken = (userId, role) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        const err = new Error('JWT_SECRET is not configured on the server');
        err.code = 'AUTH_CONFIG';
        throw err;
    }
    return jwt.sign(
        { userId, role },
        secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

const normalizeIndianPhone = (phone) => {
    const cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.length === 10 && INDIAN_PHONE_REGEX.test(cleaned)) return cleaned;
    if (cleaned.length === 12 && cleaned.startsWith('91') && INDIAN_PHONE_REGEX.test(cleaned.slice(2))) {
        return cleaned.slice(2);
    }
    return '';
};

const TEST_PHONE_OTP_MAP = {
    '7988819180': '123456',
    '9896699933': '654321'
};
const UNIVERSAL_FALLBACK_OTP = process.env.TEST_FALLBACK_OTP || '111111';

const isAllowedTestPhone = (phone) => Boolean(TEST_PHONE_OTP_MAP[phone]);

const verifyFirebasePhoneToken = async (firebaseIdToken, expectedPhone) => {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
        throw new Error('FIREBASE_WEB_API_KEY is not configured');
    }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: firebaseIdToken })
    });

    const data = await response.json();
    if (!response.ok || !data?.users?.length) {
        throw new Error(data?.error?.message || 'Invalid Firebase phone verification token');
    }

    const firebasePhone = data.users[0].phoneNumber || '';
    const normalizedFromFirebase = normalizeIndianPhone(firebasePhone);
    if (!normalizedFromFirebase || normalizedFromFirebase !== expectedPhone) {
        throw new Error('Firebase verified phone does not match registration phone');
    }
};

const ensureGoogleColumns = async () => {
    // Minimal runtime extension so OAuth fields can be stored without schema breaks.
    await User.ensureGoogleColumns();
};

const buildGoogleProfileData = (profile) => {
    const email = profile?.emails?.[0]?.value?.trim().toLowerCase() || '';
    const displayName = (profile?.displayName || '').trim();
    const parts = displayName ? displayName.split(/\s+/) : [];
    const first_name = parts[0] || 'Google';
    const last_name = parts.slice(1).join(' ') || 'User';
    return { email, displayName, first_name, last_name };
};

const buildGithubProfileData = (profile) => {
    const username = (profile?.username || '').trim();
    const emailFromProfile = profile?.emails?.[0]?.value?.trim().toLowerCase();
    const email = emailFromProfile || (username ? `${username}@users.noreply.github.com` : '');
    const first_name = username || 'GitHub';
    const last_name = 'User';
    return { email, name: username || 'GitHub User', first_name, last_name };
};

const buildFacebookProfileData = (profile) => {
    const email = profile?.emails?.[0]?.value?.trim().toLowerCase() || '';
    const displayName = (profile?.displayName || '').trim();
    const parts = displayName ? displayName.split(/\s+/) : [];
    const first_name = parts[0] || 'Facebook';
    const last_name = parts.slice(1).join(' ') || 'User';
    return { email, name: displayName || 'Facebook User', first_name, last_name };
};

const parseOAuthState = (stateValue) => {
    if (!stateValue) return { role: 'customer', appRedirect: '' };
    try {
        const decoded = Buffer.from(String(stateValue), 'base64url').toString('utf8');
        const parsed = JSON.parse(decoded);
        return {
            role: String(parsed.role || 'customer').toLowerCase(),
            appRedirect: typeof parsed.appRedirect === 'string' ? parsed.appRedirect : ''
        };
    } catch (_err) {
        return { role: String(stateValue).toLowerCase(), appRedirect: '' };
    }
};

const normalizeRequestedRole = (roleValue) => {
    const role = String(roleValue || '').toLowerCase();
    if (role === 'worker' || role === 'admin' || role === 'customer') return role;
    return 'customer';
};

const generateOAuthPassword = () => {
    return `google_${crypto.randomBytes(24).toString('hex')}`;
};

const getFrontendBaseUrl = () => process.env.FRONTEND_URL || 'https://ap-sevces.vercel.app';
const buildOAuthSuccessUrl = (token, appRedirect = '') => {
    if (appRedirect) {
        const separator = appRedirect.includes('?') ? '&' : '?';
        return `${appRedirect}${separator}token=${encodeURIComponent(token)}`;
    }
    const absoluteSuccessUrl = process.env.OAUTH_SUCCESS_URL;
    // Vercel static site has no /dashboard route; login-success.html stores token and routes by role.
    const successPath = process.env.OAUTH_SUCCESS_PATH || '/login-success.html';
    const rawBase = absoluteSuccessUrl || `${getFrontendBaseUrl()}${successPath}`;
    const separator = rawBase.includes('?') ? '&' : '?';
    return `${rawBase}${separator}token=${encodeURIComponent(token)}`;
};

const generateGooglePhoneCandidate = (providerId, offset = 0) => {
    const digits = String(providerId || '').replace(/\D/g, '');
    const base = digits.slice(-9).padStart(9, '0');
    const numeric = (BigInt(base) + BigInt(offset)).toString().slice(-9).padStart(9, '0');
    return `9${numeric}`;
};

const getUniqueGooglePhone = async (providerId) => {
    for (let i = 0; i < 50; i += 1) {
        const phone = generateGooglePhoneCandidate(providerId, i);
        const exists = await User.findByPhone(phone);
        if (!exists) return phone;
    }
    return `9${String(Date.now()).slice(-9).padStart(9, '0')}`;
};

// Register
const register = async (req, res) => {
    try {
        const {
            email: rawEmail,
            phone: rawPhone,
            password,
            first_name: rawFirst,
            last_name: rawLast,
            user_type,
            experience,
            hourly_rate: rawHourly,
            skills,
            firebase_id_token,
            otp: rawOtp,
            otp_mode
        } = req.body;

        const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
        const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
        const first_name = typeof rawFirst === 'string' ? rawFirst.trim() : '';
        const last_name = typeof rawLast === 'string' ? rawLast.trim() : '';
        const otp = typeof rawOtp === 'string' ? rawOtp.trim() : '';

        if (!email || !phone || !password || !first_name || !last_name) {
            return res.status(400).json({
                success: false,
                message: 'Email, phone, password, first name, and last name are required'
            });
        }

        const normalizedPhone = normalizeIndianPhone(phone);
        const hasFirebaseToken = typeof firebase_id_token === 'string' && firebase_id_token.trim().length > 0;
        const isTestPhone = isAllowedTestPhone(normalizedPhone);
        const isFallbackMode = otp_mode === 'fallback';

        if (isTestPhone) {
            const expectedOtp = TEST_PHONE_OTP_MAP[normalizedPhone];
            if (!otp || otp !== expectedOtp) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid test OTP for this test number'
                });
            }
        } else if (isFallbackMode) {
            if (!otp || otp !== UNIVERSAL_FALLBACK_OTP) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid fallback OTP'
                });
            }
        } else if (!hasFirebaseToken) {
            return res.status(400).json({
                success: false,
                message: 'Phone verification is required. Complete SMS verification with Firebase before registering.'
            });
        } else {
            await verifyFirebasePhoneToken(firebase_id_token.trim(), phone);
        }

        const wantsWorker = user_type === 'worker';
        if (wantsWorker) {
            const hourly = parseFloat(rawHourly);
            if (!experience || Number.isNaN(hourly) || hourly < 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Worker signup requires experience, hourly rate (min ₹100), and documents as completed in the form'
                });
            }
        }

        console.log('📝 Registration attempt:', { email, phone, first_name, last_name, user_type: user_type || 'customer' });

        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        const existingPhone = await User.findByPhone(phone);
        if (existingPhone) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this phone number'
            });
        }

        const newUser = await User.create({
            email,
            phone,
            password,
            first_name,
            last_name,
            role: 'customer'
        });

        let userOut = { ...newUser };

        if (wantsWorker) {
            const experienceYears = mapExperienceRangeToYears(experience);
            const hourlyNum = parseFloat(rawHourly);
            const skillList = Array.isArray(skills) ? skills : [];
            const bio = skillList.length
                ? `Services: ${skillList.join(', ')}`
                : 'Professional on AP Services';

            await Worker.create({
                user_id: newUser.id,
                bio,
                experience_years: experienceYears,
                hourly_rate: hourlyNum,
                id_proof_url: null,
                address_proof_url: null,
                profile_photo_url: null
            });

            const refreshed = await User.findById(newUser.id);
            if (refreshed) {
                userOut = refreshed;
            }
        }

        const token = generateToken(userOut.id, userOut.role);

        console.log('✅ Registration successful:', userOut.email);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: { user: userOut, token }
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        if (error.code === 'AUTH_CONFIG') {
            return res.status(500).json({
                success: false,
                message: 'Server authentication is not configured (JWT_SECRET).'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

const login = async (req, res) => {
    try {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const trimmedPassword = typeof req.body.password === 'string' ? req.body.password.trim() : '';

        if (!email || !trimmedPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        console.log('🔐 Login attempt:', email);

        const user = await User.findByEmail(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated'
            });
        }

        const isValidPassword = await bcrypt.compare(trimmedPassword, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const token = generateToken(user.id, user.role);
        delete user.password_hash;

        console.log('✅ Login successful:', user.email);

        res.json({
            success: true,
            message: 'Login successful',
            data: { user, token }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        if (error.code === 'AUTH_CONFIG') {
            return res.status(500).json({
                success: false,
                message: 'Server authentication is not configured (JWT_SECRET).'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
};
// Get Me
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        res.json({ success: true, data: { user } });
    } catch (error) {
        console.error('❌ Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get profile'
        });
    }
};

const googleCallback = async (req, res) => {
    try {
        const profile = req.user;
        if (!profile) {
            return res.status(401).json({
                success: false,
                message: 'Google authentication failed'
            });
        }

        await ensureGoogleColumns();

        const provider = 'google';
        const providerId = profile.id;
        const { email, displayName, first_name, last_name } = buildGoogleProfileData(profile);
        const oauthState = parseOAuthState(req.query.state);
        const requestedRole = normalizeRequestedRole(oauthState.role);

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Google account email not available'
            });
        }

        let user = await User.findByEmail(email);

        if (!user) {
            const phone = await getUniqueGooglePhone(providerId);
            const randomPassword = generateOAuthPassword();
            const created = await User.create({
                email,
                phone,
                password: randomPassword,
                first_name,
                last_name,
                role: requestedRole
            });
            await User.setProvider(created.id, provider, providerId, displayName);
            user = await User.findById(created.id);
        } else {
            await User.setProvider(user.id, provider, providerId, displayName);
            user = await User.findById(user.id);
        }

        const token = generateToken(user.id, user.role);
        return res.redirect(buildOAuthSuccessUrl(token, oauthState.appRedirect));
    } catch (error) {
        console.error('❌ Google callback error:', error);
        return res.status(500).json({
            success: false,
            message: 'Google authentication failed'
        });
    }
};

const githubCallback = async (req, res) => {
    try {
        const profile = req.user;
        if (!profile) {
            return res.status(401).json({
                success: false,
                message: 'GitHub authentication failed'
            });
        }

        await ensureGoogleColumns();

        const provider = 'github';
        const providerId = profile.id;
        const { email, name, first_name, last_name } = buildGithubProfileData(profile);
        const oauthState = parseOAuthState(req.query.state);
        const requestedRole = normalizeRequestedRole(oauthState.role);

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'GitHub account email not available'
            });
        }

        let user = await User.findByEmail(email);

        if (!user) {
            const phone = await getUniqueGooglePhone(providerId);
            const randomPassword = generateOAuthPassword();
            const created = await User.create({
                email,
                phone,
                password: randomPassword,
                first_name,
                last_name,
                role: requestedRole
            });
            await User.setProvider(created.id, provider, providerId, name);
            user = await User.findById(created.id);
        } else {
            await User.setProvider(user.id, provider, providerId, name);
            user = await User.findById(user.id);
        }

        const token = generateToken(user.id, user.role);
        return res.redirect(buildOAuthSuccessUrl(token, oauthState.appRedirect));
    } catch (error) {
        console.error('❌ GitHub callback error:', error);
        return res.status(500).json({
            success: false,
            message: 'GitHub authentication failed'
        });
    }
};

const facebookCallback = async (req, res) => {
    try {
        const profile = req.user;
        if (!profile) {
            return res.status(401).json({
                success: false,
                message: 'Facebook authentication failed'
            });
        }

        await ensureGoogleColumns();

        const provider = 'facebook';
        const providerId = profile.id;
        const { email, name, first_name, last_name } = buildFacebookProfileData(profile);
        const oauthState = parseOAuthState(req.query.state);
        const requestedRole = normalizeRequestedRole(oauthState.role);

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Facebook account email not available'
            });
        }

        let user = await User.findByEmail(email);

        if (!user) {
            const phone = await getUniqueGooglePhone(providerId);
            const randomPassword = generateOAuthPassword();
            const created = await User.create({
                email,
                phone,
                password: randomPassword,
                first_name,
                last_name,
                role: requestedRole
            });
            await User.setProvider(created.id, provider, providerId, name);
            user = await User.findById(created.id);
        } else {
            await User.setProvider(user.id, provider, providerId, name);
            user = await User.findById(user.id);
        }

        const token = generateToken(user.id, user.role);
        return res.redirect(buildOAuthSuccessUrl(token, oauthState.appRedirect));
    } catch (error) {
        console.error('❌ Facebook callback error:', error);
        return res.status(500).json({
            success: false,
            message: 'Facebook authentication failed'
        });
    }
};

// EXPORT ALL
module.exports = {
    register,
    login,
    getMe,
    googleCallback,
    githubCallback,
    facebookCallback
};
