// backend/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary with your environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure storage for multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'ap-services',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});

// Create multer upload instance
const upload = multer({ storage });

module.exports = { cloudinary, storage, upload };
