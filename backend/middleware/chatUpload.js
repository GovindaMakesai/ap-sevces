const path = require('path');
const fs = require('fs');
const multer = require('multer');

const chatDir = path.join(__dirname, '../uploads/chat');
if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safe = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
        cb(null, `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safe}`);
    }
});

const chatUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image uploads are allowed'));
    }
});

module.exports = { chatUpload };
