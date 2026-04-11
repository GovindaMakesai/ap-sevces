// backend/controllers/authController.js
const User = require('../models/User');
const Worker = require('../models/Worker');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
            skills
        } = req.body;

        const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
        const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
        const first_name = typeof rawFirst === 'string' ? rawFirst.trim() : '';
        const last_name = typeof rawLast === 'string' ? rawLast.trim() : '';

        if (!email || !phone || !password || !first_name || !last_name) {
            return res.status(400).json({
                success: false,
                message: 'Email, phone, password, first name, and last name are required'
            });
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

// EXPORT ALL
module.exports = { register, login, getMe };
