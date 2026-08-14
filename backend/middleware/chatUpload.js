const path = require('path');
const fs = require('fs');
const multer = require('multer');

const chatDir = path.join(__dirname, '../uploads/chat');
if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true });
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v', '.3gp'];

function safeExt(originalname, allowed, fallback) {
    const ext = path.extname(originalname || '').toLowerCase();
    return allowed.includes(ext) ? ext : fallback;
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatDir),
    filename: (_req, file, cb) => {
        const isVideo = file.mimetype && file.mimetype.startsWith('video/');
        const ext = isVideo
            ? safeExt(file.originalname, VIDEO_EXTS, '.mp4')
            : safeExt(file.originalname, IMAGE_EXTS, '.jpg');
        cb(null, `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    }
});

const chatImageUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image uploads are allowed'));
    }
});

const chatUpload = multer({
    storage,
    limits: { fileSize: 40 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mime = file.mimetype || '';
        if (mime.startsWith('image/') || mime.startsWith('video/')) cb(null, true);
        else cb(new Error('Only photo and video uploads are allowed'));
    }
});

module.exports = { chatUpload, chatImageUpload };
