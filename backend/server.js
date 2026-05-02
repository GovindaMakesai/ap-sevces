// backend/server.js - CLEAN VERSION

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { Server } = require('socket.io');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const { connectMongo } = require('./config/mongodb');
const { ensureChatSchema } = require('./config/ensureChatSchema');
const { registerChatSocket } = require('./socket/chatSocket');

const { storage } = require('./config/cloudinary');
const upload = multer({ storage });

const db = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const workerRoutes = require('./routes/workers');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// CORS
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://ap-sevces.vercel.app',
    'https://ap-services-xi.vercel.app',
    'https://ap-services-marketplace.vercel.app',
    'https://ap-services-marketplace.onrender.com',
    'https://ap-sevces.onrender.com'
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS not allowed'), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

db.testConnection();

// ==================== ROUTES (ONCE) ====================
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);

// ==================== TEMPORARY DEBUG ENDPOINTS ====================
app.get('/api/health', async (req, res) => {
    try {
        const dbResult = await db.query('SELECT NOW() as time');
        res.json({ success: true, message: 'Healthy', database: 'connected', time: dbResult.rows[0].time });
    } catch (error) {
        res.json({ success: true, message: 'Healthy', database: 'disconnected' });
    }
});

app.get('/api/debug/generate-hash', async (req, res) => {
    try {
        const password = 'Admin@123';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        res.json({ 
            password, 
            hash, 
            length: hash.length,
            note: 'Use this hash to update your database'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ message: 'AP Services API is running', status: 'online' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
});

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true
    }
});

app.set('io', io);
registerChatSocket(io);
connectMongo();

async function startServer() {
    await ensureChatSchema();
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
    });
}

startServer();
