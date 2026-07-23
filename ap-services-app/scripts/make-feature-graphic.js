const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(
    process.env.USERPROFILE,
    'OneDrive',
    'Desktop',
    'AP-Live-Play-Listing'
  );
  fs.mkdirSync(outDir, { recursive: true });
  const logo = fs.existsSync('assets/icon-source-backup.png')
    ? 'assets/icon-source-backup.png'
    : 'assets/icon.png';
  const logoBuf = await sharp(logo).resize(280, 280).png().toBuffer();
  const svg = Buffer.from(`<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#05070d"/>
        <stop offset="50%" stop-color="#0a1628"/>
        <stop offset="100%" stop-color="#061018"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#2F7BFF"/>
        <stop offset="100%" stop-color="#60a5fa"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="500" fill="url(#bg)"/>
    <circle cx="860" cy="80" r="140" fill="#2F7BFF" opacity="0.12"/>
    <circle cx="120" cy="420" r="160" fill="#1d4ed8" opacity="0.1"/>
    <text x="420" y="210" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="800" fill="#ffffff">AP LIVE</text>
    <text x="420" y="280" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="700" fill="url(#accent)">SERVICE</text>
    <text x="420" y="340" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="#9ec4ff">Go Live · Party Rooms · Gifts · Earn</text>
  </svg>`);
  await sharp(svg)
    .composite([{ input: logoBuf, left: 90, top: 110 }])
    .jpeg({ quality: 92 })
    .toFile(path.join(outDir, 'feature-graphic-1024x500.jpg'));
  await sharp(svg)
    .composite([{ input: logoBuf, left: 90, top: 110 }])
    .png()
    .toFile(path.join(outDir, 'feature-graphic-1024x500.png'));
  console.log('OK', outDir);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
