const path = require('path');
const fs = require('fs');
const multer = require('multer');

const chatDir = path.join(__dirname, '../uploads/chat');
if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true });
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v', '.3gp'];
const AUDIO_EXTS = ['.m4a', '.aac', '.mp3', '.wav', '.caf', '.3gp', '.ogg', '.webm'];

function safeExt(originalname, allowed, fallback) {
    const ext = path.extname(originalname || '').toLowerCase();
    return allowed.includes(ext) ? ext : fallback;
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatDir),
    filename: (_req, file, cb) => {
        const mime = file.mimetype || '';
        const name = file.originalname || '';
        const audioByName = AUDIO_EXTS.some((e) => name.toLowerCase().endsWith(e));
        const ext = mime.startsWith('audio/') || audioByName
            ? safeExt(file.originalname, AUDIO_EXTS, '.m4a')
            : mime.startsWith('video/')
              ? safeExt(file.originalname, VIDEO_EXTS, '.mp4')
              : safeExt(file.originalname, IMAGE_EXTS, '.jpg');
        cb(null, `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    }
});

const chatImageUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mime = file.mimetype || '';
        if (mime.startsWith('image/') || /heic|heif/i.test(mime) || /heic|heif/i.test(file.originalname || '')) {
            cb(null, true);
        } else cb(new Error('Only image uploads are allowed'));
    }
});

function isChatMedia(file) {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || file.filename || '');
    if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return true;
    if (/heic|heif/i.test(mime) || /heic|heif/i.test(name)) return true;
    if (/\.(m4a|aac|mp3|wav|caf|ogg|3gp)$/i.test(name)) return true;
    if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return true;
    if (/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(name)) return true;
    if (mime === 'application/octet-stream' && /\.(m4a|aac|mp3|wav|caf|ogg|mp4|mov|jpg|jpeg|png|gif|webp)$/i.test(name)) {
        return true;
    }
    return false;
}

const chatUpload = multer({
    storage,
    limits: { fileSize: 40 * 1024 * 1024, files: 4 },
    fileFilter: (_req, file, cb) => {
        if (isChatMedia(file)) cb(null, true);
        else cb(new Error('Only photo, video, and voice notes are allowed'));
    }
});

module.exports = { chatUpload, chatImageUpload };
