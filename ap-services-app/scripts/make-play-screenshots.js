/**
 * Generate Play Store phone screenshots that show the real in-app UI look
 * (Explore, Live, Party, Profile, Rankings, Wallet, Invite, Host Center).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const W = 1080;
const H = 1920;
const outDir = path.join(
  process.env.USERPROFILE,
  'OneDrive',
  'Desktop',
  'AP-Live-Play-Listing',
  'screenshots'
);
fs.mkdirSync(outDir, { recursive: true });

const logoPath = fs.existsSync(path.join(__dirname, '../assets/icon.png'))
  ? path.join(__dirname, '../assets/icon.png')
  : path.join(__dirname, '../assets/icon-source-backup.png');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function phoneChrome(inner, opts = {}) {
  const title = opts.title || 'AP Live Service';
  const tab = opts.tab || 'explore';
  const dark = opts.dark;
  const bg = dark ? '#0b0614' : '#faf6ee';
  const text = dark ? '#fff' : '#3d2e08';
  const muted = dark ? '#c4b5fd' : '#8b6914';
  const navActive = (name) =>
    tab === name
      ? dark
        ? '#fbbf24'
        : '#c9a227'
      : dark
        ? '#9ca3af'
        : '#9ca3af';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="cta" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff8c42"/><stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="liveGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#db2777"/>
    </linearGradient>
    <linearGradient id="partyGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e8c56a"/><stop offset="100%" stop-color="#c9a227"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <!-- status bar -->
  <rect width="${W}" height="56" fill="${bg}"/>
  <text x="48" y="38" font-family="Segoe UI, Arial" font-size="22" font-weight="700" fill="${text}">9:41</text>
  <text x="${W - 48}" y="38" text-anchor="end" font-family="Segoe UI, Arial" font-size="20" fill="${text}">▮▮▮ 100%</text>
  <!-- header -->
  <text x="48" y="110" font-family="Segoe UI, Arial" font-size="36" font-weight="800" fill="${text}">${esc(title)}</text>
  ${inner}
  <!-- bottom nav -->
  <rect x="0" y="${H - 140}" width="${W}" height="140" fill="${dark ? '#120c24' : '#fffdf8'}" stroke="${dark ? '#2a244d' : '#e8d4a8'}"/>
  <g font-family="Segoe UI, Arial" font-size="18" font-weight="700" text-anchor="middle">
    <text x="135" y="${H - 55}" fill="${navActive('explore')}">Live</text>
    <text x="324" y="${H - 55}" fill="${navActive('party')}">Party</text>
    <text x="540" y="${H - 55}" fill="${navActive('video')}">Video</text>
    <text x="756" y="${H - 55}" fill="${navActive('msg')}">Chat</text>
    <text x="945" y="${H - 55}" fill="${navActive('me')}">Me</text>
  </g>
  <circle cx="135" cy="${H - 95}" r="8" fill="${navActive('explore')}"/>
  <circle cx="324" cy="${H - 95}" r="8" fill="${navActive('party')}"/>
  <circle cx="540" cy="${H - 95}" r="8" fill="${navActive('video')}"/>
  <circle cx="756" cy="${H - 95}" r="8" fill="${navActive('msg')}"/>
  <circle cx="945" cy="${H - 95}" r="8" fill="${navActive('me')}"/>
</svg>`;
}

function liveCard(x, y, w, h, name, viewers, grad) {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="url(#${grad})"/>
  <rect x="${x + 20}" y="${y + 20}" width="90" height="36" rx="18" fill="rgba(0,0,0,0.35)"/>
  <text x="${x + 65}" y="${y + 45}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="18" font-weight="800" fill="#fff">LIVE</text>
  <text x="${x + 20}" y="${y + h - 50}" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#fff">${esc(name)}</text>
  <text x="${x + 20}" y="${y + h - 18}" font-family="Segoe UI, Arial" font-size="20" fill="rgba(255,255,255,0.9)">${esc(viewers)} watching</text>`;
}

const screens = [
  {
    file: '01-explore-live.png',
    svg: phoneChrome(
      `
      <rect x="48" y="140" width="780" height="70" rx="35" fill="#fff" stroke="#e8d4a8"/>
      <text x="90" y="185" font-family="Segoe UI, Arial" font-size="24" fill="#9ca3af">Search nickname or ID</text>
      <g font-family="Segoe UI, Arial" font-size="26" font-weight="700">
        <text x="70" y="270" fill="#c9a227">Live</text>
        <text x="220" y="270" fill="#9ca3af">Party</text>
        <text x="400" y="270" fill="#9ca3af">New</text>
        <text x="560" y="270" fill="#9ca3af">Nearby</text>
      </g>
      <rect x="70" y="285" width="70" height="6" rx="3" fill="#c9a227"/>
      ${liveCard(48, 320, 470, 520, 'Nova Star', '12.4K', 'liveGrad')}
      ${liveCard(542, 320, 490, 250, 'DJ Mira', '3.1K', 'partyGrad')}
      ${liveCard(542, 590, 490, 250, 'King Agency', '8.9K', 'cta')}
      ${liveCard(48, 870, 470, 360, 'Sunny Live', '5.2K', 'goldGrad')}
      ${liveCard(542, 870, 490, 360, 'Party Zone', '2.7K', 'liveGrad')}
      <circle cx="900" cy="1580" r="70" fill="url(#cta)"/>
      <text x="900" y="1590" text-anchor="middle" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#fff">＋</text>
      `,
      { title: 'Explore', tab: 'explore' }
    ),
  },
  {
    file: '02-live-room.png',
    svg: phoneChrome(
      `
      <rect x="0" y="120" width="${W}" height="1400" fill="#111827"/>
      <rect x="0" y="120" width="${W}" height="1400" fill="url(#liveGrad)" opacity="0.55"/>
      <circle cx="540" cy="620" r="180" fill="rgba(255,255,255,0.15)"/>
      <circle cx="540" cy="620" r="120" fill="rgba(255,255,255,0.25)"/>
      <text x="540" y="640" text-anchor="middle" font-family="Segoe UI, Arial" font-size="48" font-weight="800" fill="#fff">NS</text>
      <rect x="40" y="160" width="320" height="70" rx="35" fill="rgba(0,0,0,0.45)"/>
      <text x="70" y="205" font-family="Segoe UI, Arial" font-size="26" font-weight="700" fill="#fff">● Nova Star</text>
      <rect x="780" y="160" width="260" height="70" rx="35" fill="rgba(0,0,0,0.45)"/>
      <text x="910" y="205" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#fff">👁 12.4K</text>
      <rect x="40" y="1100" width="700" height="56" rx="16" fill="rgba(0,0,0,0.35)"/>
      <text x="60" y="1136" font-family="Segoe UI, Arial" font-size="22" fill="#fff">Priya: Love this stream! ✨</text>
      <rect x="40" y="1170" width="640" height="56" rx="16" fill="rgba(0,0,0,0.35)"/>
      <text x="60" y="1206" font-family="Segoe UI, Arial" font-size="22" fill="#fff">Aman sent Rose x99 🌹</text>
      <rect x="40" y="1240" width="680" height="56" rx="16" fill="rgba(0,0,0,0.35)"/>
      <text x="60" y="1276" font-family="Segoe UI, Arial" font-size="22" fill="#fff">Host: Thanks for the gifts!</text>
      <rect x="40" y="1400" width="620" height="80" rx="40" fill="rgba(0,0,0,0.5)"/>
      <text x="80" y="1450" font-family="Segoe UI, Arial" font-size="26" fill="#ddd">Say something…</text>
      <circle cx="760" cy="1440" r="44" fill="#ef4444"/>
      <text x="760" y="1450" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" font-weight="800" fill="#fff">♥</text>
      <circle cx="880" cy="1440" r="44" fill="url(#cta)"/>
      <text x="880" y="1450" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" font-weight="800" fill="#fff">🎁</text>
      <circle cx="1000" cy="1440" r="44" fill="#8b5cf6"/>
      <text x="1000" y="1450" text-anchor="middle" font-family="Segoe UI, Arial" font-size="20" font-weight="800" fill="#fff">⋯</text>
      `,
      { title: 'Live', tab: 'explore', dark: true }
    ),
  },
  {
    file: '03-party-room.png',
    svg: phoneChrome(
      `
      <rect x="0" y="120" width="${W}" height="1400" fill="#0f172a"/>
      <text x="540" y="200" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="800" fill="#fff">Friday Night Party</text>
      <text x="540" y="245" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#93c5fd">Voice room · 18 online</text>
      ${[0, 1, 2, 3, 4, 5]
        .map((i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = 120 + col * 300;
          const y = 320 + row * 320;
          const names = ['Host', 'Maya', 'Rio', 'Asha', 'Ken', 'Open'];
          return `
          <circle cx="${x}" cy="${y}" r="90" fill="url(#partyGrad)" opacity="${i === 5 ? 0.35 : 1}"/>
          <text x="${x}" y="${y + 12}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="36" font-weight="800" fill="#fff">${i === 5 ? '+' : names[i][0]}</text>
          <text x="${x}" y="${y + 130}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#e2e8f0">${names[i]}</text>`;
        })
        .join('')}
      <rect x="80" y="1100" width="${W - 160}" height="100" rx="28" fill="rgba(255,255,255,0.08)"/>
      <text x="120" y="1160" font-family="Segoe UI, Arial" font-size="26" fill="#cbd5e1">Chat · Gifts · Games · Mic</text>
      <rect x="80" y="1280" width="280" height="90" rx="45" fill="url(#cta)"/>
      <text x="220" y="1338" text-anchor="middle" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#fff">Join mic</text>
      <rect x="400" y="1280" width="280" height="90" rx="45" fill="#7c3aed"/>
      <text x="540" y="1338" text-anchor="middle" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#fff">Send gift</text>
      <rect x="720" y="1280" width="280" height="90" rx="45" fill="#334155"/>
      <text x="860" y="1338" text-anchor="middle" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#fff">Games</text>
      `,
      { title: 'Party', tab: 'party', dark: true }
    ),
  },
  {
    file: '04-profile.png',
    svg: phoneChrome(
      `
      <circle cx="540" cy="320" r="120" fill="url(#goldGrad)"/>
      <text x="540" y="340" text-anchor="middle" font-family="Segoe UI, Arial" font-size="64" font-weight="800" fill="#3d2e08">AP</text>
      <text x="540" y="500" text-anchor="middle" font-family="Segoe UI, Arial" font-size="40" font-weight="800" fill="#3d2e08">AP Live User</text>
      <text x="540" y="550" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" fill="#8b6914">ID: 4830223</text>
      <rect x="80" y="600" width="280" height="120" rx="24" fill="#fffdf8" stroke="#e8d4a8"/>
      <text x="220" y="655" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="800" fill="#c9a227">128</text>
      <text x="220" y="695" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Following</text>
      <rect x="400" y="600" width="280" height="120" rx="24" fill="#fffdf8" stroke="#e8d4a8"/>
      <text x="540" y="655" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="800" fill="#c9a227">2.4K</text>
      <text x="540" y="695" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Fans</text>
      <rect x="720" y="600" width="280" height="120" rx="24" fill="#fffdf8" stroke="#e8d4a8"/>
      <text x="860" y="655" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="800" fill="#c9a227">56</text>
      <text x="860" y="695" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Visitors</text>
      ${['Wallet &amp; coins', 'Invite friends', 'Host / Streamer Center', 'Rankings', 'VIP privileges']
        .map(
          (label, i) => `
        <rect x="48" y="${780 + i * 110}" width="${W - 96}" height="95" rx="22" fill="#fff" stroke="#e8d4a8"/>
        <text x="90" y="${838 + i * 110}" font-family="Segoe UI, Arial" font-size="28" font-weight="700" fill="#3d2e08">${label}</text>
        <text x="${W - 90}" y="${838 + i * 110}" text-anchor="end" font-family="Segoe UI, Arial" font-size="32" fill="#c9a227">›</text>`
        )
        .join('')}
      `,
      { title: 'Me', tab: 'me' }
    ),
  },
  {
    file: '05-rankings.png',
    svg: phoneChrome(
      `
      <g font-family="Segoe UI, Arial" font-size="28" font-weight="800" text-anchor="middle">
        <rect x="60" y="150" width="300" height="70" rx="35" fill="url(#goldGrad)"/>
        <text x="210" y="195" fill="#3d2e08">Host</text>
        <rect x="390" y="150" width="300" height="70" rx="35" fill="#fff" stroke="#e8d4a8"/>
        <text x="540" y="195" fill="#8b6914">Rich</text>
        <rect x="720" y="150" width="300" height="70" rx="35" fill="#fff" stroke="#e8d4a8"/>
        <text x="870" y="195" fill="#8b6914">Gift</text>
      </g>
      <text x="70" y="280" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#8b6914">Daily · Weekly · Monthly</text>
      <!-- podium -->
      <rect x="390" y="340" width="300" height="280" rx="24" fill="url(#goldGrad)"/>
      <text x="540" y="420" text-anchor="middle" font-size="40">👑</text>
      <circle cx="540" cy="500" r="55" fill="#fff"/>
      <text x="540" y="512" text-anchor="middle" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#c9a227">1</text>
      <text x="540" y="590" text-anchor="middle" font-family="Segoe UI, Arial" font-size="26" font-weight="800" fill="#3d2e08">Nova Star</text>
      <rect x="80" y="420" width="280" height="200" rx="24" fill="#e8d4a8"/>
      <text x="220" y="520" text-anchor="middle" font-family="Segoe UI, Arial" font-size="32" font-weight="800" fill="#6b4f10">2</text>
      <text x="220" y="580" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#6b4f10">DJ Mira</text>
      <rect x="720" y="450" width="280" height="170" rx="24" fill="#f5e6c8"/>
      <text x="860" y="540" text-anchor="middle" font-family="Segoe UI, Arial" font-size="32" font-weight="800" fill="#8b6914">3</text>
      <text x="860" y="590" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#8b6914">Sunny</text>
      ${['4  Aria Live', '5  King Host', '6  Melody', '7  Pixel Pro']
        .map(
          (row, i) => `
        <rect x="48" y="${700 + i * 120}" width="${W - 96}" height="100" rx="20" fill="#fff" stroke="#e8d4a8"/>
        <text x="90" y="${760 + i * 120}" font-family="Segoe UI, Arial" font-size="28" font-weight="700" fill="#3d2e08">${row}</text>
        <rect x="820" y="${725 + i * 120}" width="170" height="55" rx="27" fill="url(#cta)"/>
        <text x="905" y="${760 + i * 120}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" font-weight="800" fill="#fff">Follow</text>`
        )
        .join('')}
      `,
      { title: 'Rankings', tab: 'explore' }
    ),
  },
  {
    file: '06-wallet.png',
    svg: phoneChrome(
      `
      <rect x="48" y="160" width="${W - 96}" height="280" rx="32" fill="url(#goldGrad)"/>
      <text x="90" y="230" font-family="Segoe UI, Arial" font-size="26" fill="#3d2e08">Wallet balance</text>
      <text x="90" y="310" font-family="Segoe UI, Arial" font-size="64" font-weight="800" fill="#3d2e08">128,450</text>
      <text x="90" y="370" font-family="Segoe UI, Arial" font-size="26" fill="#6b4f10">Coins available</text>
      <rect x="48" y="480" width="470" height="160" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="283" y="550" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="800" fill="#c9a227">56,200</text>
      <text x="283" y="600" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" fill="#8b6914">Points</text>
      <rect x="562" y="480" width="470" height="160" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="797" y="550" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" font-weight="800" fill="#f59e0b">Recharge</text>
      <text x="797" y="600" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" fill="#8b6914">Buy coins</text>
      <text x="60" y="720" font-family="Segoe UI, Arial" font-size="30" font-weight="800" fill="#3d2e08">Popular gifts</text>
      ${['Rose', 'Heart', 'Crown', 'Rocket', 'Castle', 'Sports Car']
        .map((g, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = 48 + col * 340;
          const y = 760 + row * 280;
          return `
          <rect x="${x}" y="${y}" width="310" height="250" rx="24" fill="#fff" stroke="#e8d4a8"/>
          <circle cx="${x + 155}" cy="${y + 100}" r="55" fill="url(#cta)"/>
          <text x="${x + 155}" y="${y + 112}" text-anchor="middle" font-size="36">🎁</text>
          <text x="${x + 155}" y="${y + 190}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="26" font-weight="700" fill="#3d2e08">${g}</text>
          <text x="${x + 155}" y="${y + 225}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">${(i + 1) * 100} coins</text>`;
        })
        .join('')}
      `,
      { title: 'Wallet', tab: 'me' }
    ),
  },
  {
    file: '07-invite.png',
    svg: phoneChrome(
      `
      <rect x="48" y="160" width="${W - 96}" height="360" rx="32" fill="url(#cta)"/>
      <text x="90" y="250" font-family="Segoe UI, Arial" font-size="40" font-weight="800" fill="#fff">Invite friends</text>
      <text x="90" y="310" font-family="Segoe UI, Arial" font-size="26" fill="#fffdf8">Earn rewards when friends join &amp; go live</text>
      <rect x="90" y="360" width="500" height="90" rx="45" fill="#fff"/>
      <text x="340" y="418" text-anchor="middle" font-family="Segoe UI, Arial" font-size="30" font-weight="800" fill="#c2410c">Share invite</text>
      <text x="60" y="600" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#3d2e08">My invite ID</text>
      <rect x="48" y="630" width="${W - 96}" height="120" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="90" y="705" font-family="Segoe UI, Arial" font-size="42" font-weight="800" fill="#c9a227">4830223</text>
      <text x="60" y="830" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#3d2e08">My rewards</text>
      <rect x="48" y="860" width="${W - 96}" height="160" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="90" y="930" font-family="Segoe UI, Arial" font-size="26" fill="#8b6914">Pending points</text>
      <text x="90" y="985" font-family="Segoe UI, Arial" font-size="44" font-weight="800" fill="#c9a227">10,500</text>
      <rect x="48" y="1060" width="${W - 96}" height="140" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="90" y="1120" font-family="Segoe UI, Arial" font-size="26" font-weight="700" fill="#3d2e08">Friend joined · Host mission</text>
      <text x="90" y="1165" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">+10,000 points unlocked</text>
      <rect x="48" y="1230" width="${W - 96}" height="140" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="90" y="1290" font-family="Segoe UI, Arial" font-size="26" font-weight="700" fill="#3d2e08">Income rank</text>
      <text x="90" y="1335" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Based on invite reward points</text>
      `,
      { title: 'Invite', tab: 'me' }
    ),
  },
  {
    file: '08-streamer-center.png',
    svg: phoneChrome(
      `
      <text x="60" y="180" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#3d2e08">Your balance</text>
      <rect x="48" y="210" width="470" height="200" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="283" y="290" text-anchor="middle" font-family="Segoe UI, Arial" font-size="40" font-weight="800" fill="#c9a227">24,800</text>
      <text x="283" y="345" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Total points</text>
      <rect x="562" y="210" width="470" height="200" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="797" y="290" text-anchor="middle" font-family="Segoe UI, Arial" font-size="40" font-weight="800" fill="#f59e0b">18,200</text>
      <text x="797" y="345" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Total coins</text>
      <text x="60" y="490" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#3d2e08">Hosting time</text>
      <rect x="48" y="520" width="310" height="70" rx="35" fill="url(#goldGrad)"/>
      <text x="203" y="565" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="800" fill="#3d2e08">Today</text>
      <rect x="380" y="520" width="200" height="70" rx="35" fill="#fff" stroke="#e8d4a8"/>
      <text x="480" y="565" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#8b6914">Week</text>
      <rect x="600" y="520" width="200" height="70" rx="35" fill="#fff" stroke="#e8d4a8"/>
      <text x="700" y="565" text-anchor="middle" font-family="Segoe UI, Arial" font-size="24" font-weight="700" fill="#8b6914">Month</text>
      <rect x="48" y="630" width="470" height="180" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="283" y="710" text-anchor="middle" font-family="Segoe UI, Arial" font-size="36" font-weight="800" fill="#7c3aed">2h 40m</text>
      <text x="283" y="760" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Live hours</text>
      <rect x="562" y="630" width="470" height="180" rx="24" fill="#fff" stroke="#e8d4a8"/>
      <text x="797" y="710" text-anchor="middle" font-family="Segoe UI, Arial" font-size="36" font-weight="800" fill="#0ea5e9">1h 15m</text>
      <text x="797" y="760" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#8b6914">Party hours</text>
      <text x="60" y="890" font-family="Segoe UI, Arial" font-size="28" font-weight="800" fill="#3d2e08">Host earning policies</text>
      <rect x="48" y="920" width="470" height="360" rx="24" fill="url(#liveGrad)"/>
      <text x="283" y="1080" text-anchor="middle" font-family="Segoe UI, Arial" font-size="32" font-weight="800" fill="#fff">Star Host</text>
      <text x="283" y="1130" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#fce7f3">Weekly rewards</text>
      <rect x="562" y="920" width="470" height="360" rx="24" fill="url(#partyGrad)"/>
      <text x="797" y="1080" text-anchor="middle" font-family="Segoe UI, Arial" font-size="32" font-weight="800" fill="#fff">Normal Host</text>
      <text x="797" y="1130" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#e0f2fe">Bonus support</text>
      <rect x="48" y="1320" width="${W - 96}" height="110" rx="55" fill="url(#cta)"/>
      <text x="540" y="1390" text-anchor="middle" font-family="Segoe UI, Arial" font-size="30" font-weight="800" fill="#fff">Go Live now</text>
      `,
      { title: 'Streamer Center', tab: 'me' }
    ),
  },
];

(async () => {
  let logoBuf = null;
  try {
    logoBuf = await sharp(logoPath).resize(96, 96).png().toBuffer();
  } catch (_e) {}

  for (const s of screens) {
    let img = sharp(Buffer.from(s.svg));
    if (logoBuf) {
      img = img.composite([{ input: logoBuf, left: W - 160, top: 70 }]);
    }
    const out = path.join(outDir, s.file);
    await img.png({ compressionLevel: 8 }).toFile(out);
    const st = fs.statSync(out);
    console.log(s.file, st.size);
  }
  console.log('OUT', outDir);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
