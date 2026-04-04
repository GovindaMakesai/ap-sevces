// backend/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );
};

// Register
const register = async (req, res) => {
    try {
        const { email, phone, password, first_name, last_name } = req.body;
        
        console.log('📝 Registration attempt:', { email, phone, first_name, last_name });
        
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
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newUser = await User.create({
            email,
            phone,
            password: hashedPassword,
            first_name,
            last_name
        });
        
        const token = generateToken(newUser.id, newUser.role);
        
        console.log('✅ Registration successful:', newUser.email);
        
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: { user: newUser, token }
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // TRIM THE PASSWORD to remove any extra spaces or newlines
        const trimmedPassword = password?.trim();
        
        console.log('🔐 Login attempt:', email);
        console.log('📦 Original password length:', password?.length);
        console.log('📦 Trimmed password length:', trimmedPassword?.length);
        console.log('📦 Received password (hex):', Buffer.from(trimmedPassword, 'utf8').toString('hex'));
        console.log('📦 Expected password (Admin@123) hex:', '41646d696e40313233');
        
        const user = await User.findByEmail(email);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        console.log('📦 Stored hash:', user.password_hash?.substring(0, 20) + '...');
        
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated'
            });
        }
        
        const isValidPassword = await bcrypt.compare(trimmedPassword, user.password_hash);
        console.log('🔑 Password valid:', isValidPassword);
        
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
