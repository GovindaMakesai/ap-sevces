// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const {
    validateRegistration,
    validateLogin,
    checkValidation
} = require('../middleware/validation');

const frontendBaseUrl = process.env.FRONTEND_URL || 'https://ap-sevces.vercel.app';
const oauthFailureRedirect = `${frontendBaseUrl}/login.html?error=oauth_auth_failed`;
const googleCallbackURL =
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.GOOGLE_CALLBACK_URL ||
    'https://ap-sevces.onrender.com/auth/google/callback';
const githubCallbackURL = process.env.GITHUB_CALLBACK_URL || 'https://ap-sevces.onrender.com/auth/github/callback';
const facebookCallbackURL = process.env.FACEBOOK_CALLBACK_URL || 'https://ap-sevces.onrender.com/auth/facebook/callback';
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
router.post('/send-signup-otp', authController.sendSignupOtp);
router.post('/verify-signup-otp', authController.verifySignupOtp);
router.post('/register', validateRegistration, checkValidation, authController.register);
router.post('/login', validateLogin, checkValidation, authController.login);
router.get('/me', verifyToken, authController.getMe);
if (isGoogleConfigured) {
    router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
    router.get(
        '/google/callback',
        ensureGoogleCode,
        passport.authenticate('google', { session: false, failureRedirect: oauthFailureRedirect }),
        authController.googleCallback
    );
    router.get(
        '/api/google/callback',
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
    router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));
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
        const authUrl = `${facebookAuthorizationBase}?client_id=${encodeURIComponent(process.env.FACEBOOK_APP_ID)}&redirect_uri=${encodeURIComponent(facebookCallbackURL)}&scope=email&response_type=code`;
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
