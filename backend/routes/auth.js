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

const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
const oauthFailureRedirect = `${frontendBaseUrl}/login.html?error=oauth_auth_failed`;

if (!passport._strategy('google')) {
    const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback';

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
}

if (!passport._strategy('github')) {
    const githubCallbackURL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/auth/github/callback';

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
}

if (!passport._strategy('facebook')) {
    passport.use(new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_APP_ID,
            clientSecret: process.env.FACEBOOK_APP_SECRET,
            callbackURL: '/auth/facebook/callback',
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
}

// Public routes
router.post('/send-signup-otp', authController.sendSignupOtp);
router.post('/verify-signup-otp', authController.verifySignupOtp);
router.post('/register', validateRegistration, checkValidation, authController.register);
router.post('/login', validateLogin, checkValidation, authController.login);
router.get('/me', verifyToken, authController.getMe);
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
    '/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: oauthFailureRedirect }),
    authController.googleCallback
);
router.get(
    '/api/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: oauthFailureRedirect }),
    authController.googleCallback
);
router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));
router.get(
    '/github/callback',
    passport.authenticate('github', { session: false, failureRedirect: oauthFailureRedirect }),
    authController.githubCallback
);
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get(
    '/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: oauthFailureRedirect }),
    authController.facebookCallback
);

module.exports = router;
