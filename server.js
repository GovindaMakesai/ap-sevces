const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

// Import routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const workerRoutes = require('./src/routes/workers');
const bookingRoutes = require('./src/routes/bookings');
const serviceRoutes = require('./src/routes/services');
const reviewRoutes = require('./src/routes/reviews');
const chatRoutes = require('./src/routes/chat');
const paymentRoutes = require('./src/routes/payments');

// Import middleware
const { errorHandler } = require('./src/middleware/errorHandler');
const { logger } = require('./src/utils/logger');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// ==================== MIDDLEWARE ====================

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression
app.use(compression());

// CORS
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Rate limiting
const limiter = rateLimit({
    windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== DATABASE CONNECTION ====================

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ap_services', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

connectDB();

// ==================== SOCKET.IO SETUP ====================

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return next(new Error('User not found'));
        }

        socket.userId = user.id;
        socket.userRole = user.role;
        next();
    } catch (error) {
        next(new Error('Invalid token'));
    }
}).on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.userId}`);

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);

    // Handle joining chat room
    socket.on('join-chat', (bookingId) => {
        socket.join(`chat:${bookingId}`);
        console.log(`User ${socket.userId} joined chat ${bookingId}`);
    });

    // Handle sending messages
    socket.on('send-message', async (data) => {
        try {
            const { bookingId, receiverId, message, attachments } = data;

            // Save message to database
            const newMessage = await Message.create({
                sender_id: socket.userId,
                receiver_id: receiverId,
                booking_id: bookingId,
                message,
                attachments
            });

            // Emit to chat room
            io.to(`chat:${bookingId}`).emit('new-message', {
                ...newMessage.toJSON(),
                sender: { id: socket.userId }
            });

            // Send notification to receiver
            io.to(`user:${receiverId}`).emit('notification', {
                type: 'new_message',
                title: 'New Message',
                message: 'You have a new message',
                data: { bookingId, senderId: socket.userId }
            });

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
        socket.to(`chat:${data.bookingId}`).emit('user-typing', {
            userId: socket.userId,
            isTyping: data.isTyping
        });
    });

    // Handle marking messages as read
    socket.on('mark-read', async (data) => {
        try {
            await Message.updateMany(
                {
                    booking_id: data.bookingId,
                    receiver_id: socket.userId,
                    is_read: false
                },
                { is_read: true, read_at: new Date() }
            );

            io.to(`chat:${data.bookingId}`).emit('messages-read', {
                userId: socket.userId,
                bookingId: data.bookingId
            });
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.userId}`);
    });
});

// Make io accessible to routes
app.set('io', io);

// ==================== ROUTES ====================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use(errorHandler);

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 API URL: ${process.env.API_URL || `http://localhost:${PORT}`}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('Database connection closed');
            process.exit(0);
        });
    });
});

module.exports = { app, server, io };
