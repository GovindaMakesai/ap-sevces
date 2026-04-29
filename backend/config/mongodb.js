const mongoose = require('mongoose');

let isConnected = false;

async function connectMongo() {
    if (isConnected) return mongoose.connection;

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.warn('MONGODB_URI is not set. Chat persistence is disabled until MongoDB is configured.');
        return null;
    }

    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000
        });
        isConnected = true;
        console.log('✅ MongoDB connected for chat');
        return mongoose.connection;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        return null;
    }
}

module.exports = { connectMongo };
