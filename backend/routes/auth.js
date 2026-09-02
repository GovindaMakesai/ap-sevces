const logger = require('../lib/logger');
const { oauthLimiter } = require('../middleware/security');
const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const authController = require('../controllers/authController');
const phoneAuthController = require('../controllers/phoneAuthController');
const { verifyToken } = require('../middleware/auth');
const { phoneOtpSendLimiter, phoneOtpVerifyLimiter } = require('../middleware/security');
const upload = require('../middleware/upload');
const {
    validateRegistration,
    validateLogin,
    checkValidation
} = require('../middleware/validation');

const frontendBaseUrl = process.env.FRONTEND_URL || 'https://api.apservices.in';
const oauthFailureRedirect = `${frontendBaseUrl}/login.html?error=oauth_auth_failed`;
const oauthCallbackBase = (
    process.env.OAUTH_CALLBACK_BASE ||
    process.env.OAUTH_PUBLIC_URL ||
    frontendBaseUrl
).replace(/\/$/, '');
const googleCallbackURL =
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.GOOGLE_CALLBACK_URL ||
    `${oauthCallbackBase}/auth/google/callback`;
const githubCallbackURL =
    process.env.GITHUB_CALLBACK_URL || `${oauthCallbackBase}/auth/github/callback`;
const facebookCallbackURL =
    process.env.FACEBOOK_CALLBACK_URL || `${oauthCallbackBase}/auth/facebook/callback`;

logger.info('[auth] OAuth callbacks configured', {
    google: googleCallbackURL,
    github: githubCallbackURL,
    facebook: facebookCallbackURL,
});

router.use((req, res, next) => {
    if (
      process.env.OAUTH_DEBUG === 'true' &&
      (req.path.includes('google') || req.path.includes('callback') || req.path === '/oauth-debug')
    ) {
        logger.debug('[auth] OAuth request', {
          method: req.method,
          path: req.originalUrl || req.url,
          host: req.get('host'),
          hasCode: Boolean(req.query?.code),
        });
    }
    next();
});

router.get('/oauth-debug', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.json({
        success: true,
        frontendUrl: frontendBaseUrl,
        oauthCallbackBase: oauthCallbackBase,
        callbacks: {
            google: googleCallbackURL,
            github: githubCallbackURL,
            facebook: facebookCallbackURL,
        },
        configured: {
            google: isGoogleConfigured,
            github: isGithubConfigured,
            facebook: isFacebookConfigured,
        },
        failureRedirect: oauthFailureRedirect,
        successPath: process.env.OAUTH_SUCCESS_PATH || '/login-success.html',
    });
});
const facebookAuthorizationBase = 'https://www.facebook.com/v3.2/dialog/oauth';

const missingProviderHandler = (provider, envKeys) => (req, res) => {
    res.status(503).json({
        success: false,
        message: `${provider} OAuth is not configured on the server`,
        missing: envKeys.filter((k) => !process.env[k])
    });
};

const isGoogleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const isGithubConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
const isFacebookConfigured = Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
const normalizeOAuthRole = (value) => {
  const role = String(value || '').toLowerCase();
  return role === 'worker' ? 'worker' : 'customer';
};
const buildOAuthState = (req) => {
    const role = normalizeOAuthRole(String(req.query.role || 'customer').toLowerCase());
    const appRedirect = typeof req.query.app_redirect === 'string' ? req.query.app_redirect : '';
    const payload = JSON.stringify({ role, appRedirect });
    return Buffer.from(payload, 'utf8').toString('base64url');
};

if (isGoogleConfigured && !passport._strategy('google')) {
    passport.use(new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: googleCallbackURL
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                return done(null, profile);
            } catch (error) {
                return done(error);
            }
        }
    ));
} else if (!isGoogleConfigured) {
    console.warn('⚠️ Google OAuth disabled: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing');
}

if (isGithubConfigured && !passport._strategy('github')) {
    passport.use(new GitHubStrategy(
        {
            clientID: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            callbackURL: githubCallbackURL
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                return done(null, profile);
            } catch (error) {
                return done(error);
            }
        }
    ));
} else if (!isGithubConfigured) {
    console.warn('⚠️ GitHub OAuth disabled: GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET missing');
}

if (isFacebookConfigured && !passport._strategy('facebook')) {
    passport.use(new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_APP_ID,
            clientSecret: process.env.FACEBOOK_APP_SECRET,
            callbackURL: facebookCallbackURL,
            authorizationURL: facebookAuthorizationBase,
            profileFields: ['id', 'displayName', 'emails']
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                return done(null, profile);
            } catch (error) {
                return done(error);
            }
        }
    ));
} else if (!isFacebookConfigured) {
    console.warn('⚠️ Facebook OAuth disabled: FACEBOOK_APP_ID/FACEBOOK_APP_SECRET missing');
}

const ensureFacebookCode = (req, res, next) => {
    if (!req.query.code) {
        return res.status(400).json({
            success: false,
            message: 'Missing Facebook authorization code'
        });
    }
    return next();
};

const ensureGoogleCode = (req, res, next) => {
    if (!req.query.code) {
        return res.status(400).json({
            success: false,
            message: 'Missing Google authorization code'
        });
    }
    return next();
};

// Public routes
router.post('/register', validateRegistration, checkValidation, authController.register);
router.post('/login', validateLogin, checkValidation, authController.login);
router.post('/phone/send-otp', phoneOtpSendLimiter, phoneAuthController.sendOtp);
router.post('/phone/verify-otp', phoneOtpVerifyLimiter, phoneAuthController.verifyOtp);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/exchange-code', oauthLimiter, authController.exchangeCode);
router.get('/ws-token', verifyToken, authController.wsToken);
router.get('/session', require('../middleware/auth').optionalAuth, authController.session);
router.get('/me', verifyToken, authController.getMe);
router.patch('/profile', verifyToken, authController.updateProfile);
router.put('/profile', verifyToken, authController.updateProfile);
router.post('/profile/photo', verifyToken, upload.single('photo'), authController.uploadProfilePhoto);
router.get('/profile/album', verifyToken, authController.getProfileAlbum);
router.post(
    '/profile/album',
    verifyToken,
    upload.single('photo'),
    authController.uploadProfileAlbumPhoto
);
router.delete('/profile/album/:photoId', verifyToken, authController.deleteProfileAlbumPhoto);
if (isGoogleConfigured) {
    router.get('/google', oauthLimiter, (req, res, next) => {
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            session: false,
            state: buildOAuthState(req)
        })(req, res, next);
    });
    router.get(
        '/google/callback',
        oauthLimiter,
        ensureGoogleCode,
        passport.authenticate('google', { session: false, failureRedirect: oauthFailureRedirect }),
        authController.googleCallback
    );
    router.get(
        '/api/google/callback',
        oauthLimiter,
        ensureGoogleCode,
        passport.authenticate('google', { session: false, failureRedirect: oauthFailureRedirect }),
        authController.googleCallback
    );
} else {
    const googleMissing = missingProviderHandler('Google', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
    router.get('/google', googleMissing);
    router.get('/google/callback', googleMissing);
    router.get('/api/google/callback', googleMissing);
}

if (isGithubConfigured) {
    router.get('/github', (req, res, next) => {
        passport.authenticate('github', {
            scope: ['user:email'],
            session: false,
            state: buildOAuthState(req)
        })(req, res, next);
    });
    router.get(
        '/github/callback',
        passport.authenticate('github', { session: false, failureRedirect: oauthFailureRedirect }),
        authController.githubCallback
    );
} else {
    const githubMissing = missingProviderHandler('GitHub', ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']);
    router.get('/github', githubMissing);
    router.get('/github/callback', githubMissing);
}

if (isFacebookConfigured) {
    router.get('/facebook', (req, res) => {
        const state = buildOAuthState(req);
        const authUrl = `${facebookAuthorizationBase}?client_id=${encodeURIComponent(process.env.FACEBOOK_APP_ID)}&redirect_uri=${encodeURIComponent(facebookCallbackURL)}&scope=email&response_type=code&state=${encodeURIComponent(state)}`;
        return res.redirect(authUrl);
    });
    router.get(
        '/facebook/callback',
        ensureFacebookCode,
        passport.authenticate('facebook', { session: false, failureRedirect: oauthFailureRedirect }),
        authController.facebookCallback
    );
} else {
    const facebookMissing = missingProviderHandler('Facebook', ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']);
    router.get('/facebook', facebookMissing);
    router.get('/facebook/callback', facebookMissing);
}

module.exports = router;
