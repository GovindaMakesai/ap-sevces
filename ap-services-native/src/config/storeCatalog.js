import { ANIMATED_GIFTS } from './giftAnims';
import { FRAME_SKINS } from '../components/AvatarFrame';
import { RING_SKINS } from './rings';

export const STORE_CATS = [
  { id: 'popular', label: 'Popular', icon: '🔥', tint: '#F43F5E' },
  { id: 'ring', label: 'Ring', icon: '💍', tint: '#F472B6' },
  { id: 'honor', label: 'Honor', icon: '🛡️', tint: '#E8B84A' },
  { id: 'special', label: 'Rare ID', icon: '🪪', tint: '#FB7185' },
  { id: 'entry', label: 'Ride', icon: '🚗', tint: '#A78BFA' },
  { id: 'profile', label: 'Profile Card', icon: '👤', tint: '#8B5CF6' },
  { id: 'frame', label: 'Avatar Frame', icon: '🖼️', tint: '#2DD4BF' },
  { id: 'theme', label: 'Party Theme', icon: '👕', tint: '#34D399' },
  { id: 'bubble', label: 'Chat Bubble', icon: '💬', tint: '#F9A8D4' },
  { id: 'mic', label: 'Mic Voice', icon: '🎤', tint: '#60A5FA' },
  { id: 'dynamic', label: 'Dynamic', icon: '✨', tint: '#FBBF24' },
  { id: 'tag', label: 'Entry Tag', icon: '🏷️', tint: '#F59E0B' },
];

export const STORE_ITEMS = [
  ...ANIMATED_GIFTS.map((g, i) => ({
    cat: 'popular',
    name: g.name,
    emoji: g.emoji,
    price: g.price,
    thumbnailUrl: g.thumbnailUrl,
    slug: g.slug,
    neu: i < 3,
    ticket: false,
  })),
  { cat: 'honor', name: 'PK Energy Gift', emoji: '⚡', price: 2, ticket: true, neu: true, honor: 0, limit: '2648/4000', thumbnailUrl: ANIMATED_GIFTS[3]?.thumbnailUrl, preview: ['#FDE68A', '#F59E0B'] },
  { cat: 'honor', name: 'PK War Drum Gift', emoji: '🥁', price: 6, ticket: true, honor: 0, thumbnailUrl: ANIMATED_GIFTS[5]?.thumbnailUrl, preview: ['#FDE68A', '#D97706'] },
  { cat: 'honor', name: 'PK Defense Gift', emoji: '🛡️', price: 30, ticket: true, honor: 0, thumbnailUrl: ANIMATED_GIFTS[0]?.thumbnailUrl, preview: ['#FDE68A', '#B45309'] },
  { cat: 'honor', name: 'Custom Ride - 2 Months', emoji: '🚗', price: 10000, ticket: true, honor: 7, thumbnailUrl: ANIMATED_GIFTS[12]?.thumbnailUrl, preview: ['#FDE68A', '#CA8A04'] },
  { cat: 'honor', name: 'Supreme Box', emoji: '🎁', price: 200, ticket: true, honor: 1, thumbnailUrl: ANIMATED_GIFTS[4]?.thumbnailUrl, preview: ['#FDE68A', '#EAB308'] },
  { cat: 'honor', name: 'Moments Pin Card - 1h', emoji: '📌', price: 400, ticket: true, honor: 3, preview: ['#FDE68A', '#A16207'] },
  { cat: 'entry', name: 'Svip 13-14', emoji: '🐯', event: true, thumbnailUrl: ANIMATED_GIFTS[11]?.thumbnailUrl, preview: ['#60a5fa', '#1d4ed8'] },
  { cat: 'entry', name: 'Rich Lv90-99', emoji: '⚔️', event: true, thumbnailUrl: ANIMATED_GIFTS[8]?.thumbnailUrl, preview: ['#fde68a', '#b45309'] },
  { cat: 'entry', name: 'Bicycle', emoji: '🚲', price: 50000, thumbnailUrl: ANIMATED_GIFTS[12]?.thumbnailUrl },
  { cat: 'entry', name: 'Daredevil', emoji: '🏎️', price: 500000, thumbnailUrl: ANIMATED_GIFTS[12]?.thumbnailUrl },
  { cat: 'entry', name: 'Carpet', emoji: '🧞', price: 100000, thumbnailUrl: ANIMATED_GIFTS[0]?.thumbnailUrl },
  { cat: 'entry', name: 'Raft', emoji: '⛵', price: 400000, thumbnailUrl: ANIMATED_GIFTS[9]?.thumbnailUrl },

  ...FRAME_SKINS.map((s) => ({
    cat: 'frame',
    name: s.name,
    emoji: '🖼️',
    price: s.price,
    skinId: s.id,
    preview: s.colors.slice(0, 2),
  })),

  { cat: 'bubble', name: 'Wealthy', emoji: '👑', price: 20000, sample: "Let's Chat~" },
  { cat: 'bubble', name: 'Music carnival', emoji: '🎵', price: 20000, sample: "Let's Chat~" },
  { cat: 'bubble', name: 'Leaves', emoji: '🍃', price: 10000, sample: "Let's Chat~" },
  { cat: 'bubble', name: 'LOVE', emoji: '🌹', price: 10000, sample: "Let's Chat~" },
  { cat: 'bubble', name: 'SVIP1', emoji: 'V1', event: true, sample: "Let's Chat~" },
  { cat: 'bubble', name: 'SVIP2', emoji: 'V2', event: true, sample: "Let's Chat~" },
  { cat: 'bubble', name: 'SVIP3', emoji: 'V3', event: true, sample: "Let's Chat~" },
  { cat: 'bubble', name: 'SVIP4', emoji: 'V4', event: true, sample: "Let's Chat~" },

  { cat: 'theme', name: 'Navratri', emoji: '🪔', event: true },
  { cat: 'theme', name: 'Friendship Day', emoji: '🤝', price: 3000 },
  { cat: 'theme', name: 'Special Theme', emoji: '🛕', event: true },
  { cat: 'theme', name: 'Shoulder of Comfort', emoji: '🌙', price: 6999 },

  { cat: 'special', name: 'ID 11100', emoji: '11100', price: 7200000, ssr: true, neu: true },
  { cat: 'special', name: 'ID 778899', emoji: '778899', price: 10000000, ssr: true },
  { cat: 'special', name: 'ID 667788', emoji: '667788', price: 10000000, sr: true },
  { cat: 'special', name: 'ID 112233', emoji: '112233', price: 10000000, ssr: true, neu: true },
  { cat: 'special', name: 'ID 889900', emoji: '889900', price: 10000000, sr: true },

  { cat: 'profile', name: 'Svip 9-10', emoji: '🦅', event: true, preview: ['#93c5fd', '#1e3a8a'] },
  { cat: 'profile', name: 'SVIP1+', emoji: '🔥', event: true, preview: ['#fb923c', '#9a3412'] },
  { cat: 'profile', name: 'SVIP6+', emoji: '👑', event: true, preview: ['#c084fc', '#6b21a8'] },
  { cat: 'profile', name: 'SVIP11+', emoji: '💜', event: true, preview: ['#e879f9', '#7e22ce'] },
  { cat: 'profile', name: 'SVIP16+', emoji: '❄️', event: true, preview: ['#67e8f9', '#155e75'] },
  { cat: 'profile', name: '2025 Holi', emoji: '🎨', event: true },

  { cat: 'mic', name: 'SVIP6+', emoji: '⚪', event: true, preview: ['#e5e7eb', '#9ca3af'] },
  { cat: 'mic', name: 'SVIP10+', emoji: '🟣', event: true, preview: ['#c084fc', '#db2777'] },
  { cat: 'mic', name: 'SVIP16+', emoji: '🟡', event: true, preview: ['#fde047', '#f59e0b'] },
  { cat: 'mic', name: '2025 Eid', emoji: '🌙', event: true, preview: ['#f472b6', '#38bdf8'] },
  { cat: 'mic', name: 'Zodiac', emoji: '🌀', event: true, preview: ['#818cf8', '#6d28d9'] },
  { cat: 'mic', name: "Valentine's Day-boy", emoji: '💙', event: true, preview: ['#38bdf8', '#1d4ed8'] },

  { cat: 'dynamic', name: 'SVIP6+', emoji: '✨', event: true },
  { cat: 'dynamic', name: 'SVIP10+', emoji: '💫', event: true },
  { cat: 'dynamic', name: 'SVIP16+', emoji: '🌟', event: true },
  { cat: 'dynamic', name: '2025 Eid', emoji: '🎆', event: true },

  { cat: 'tag', name: 'SVIP1', emoji: '1️⃣', event: true },
  { cat: 'tag', name: 'SVIP2', emoji: '2️⃣', event: true },
  { cat: 'tag', name: 'SVIP3', emoji: '3️⃣', event: true },
  { cat: 'tag', name: 'SVIP4', emoji: '4️⃣', event: true },
  { cat: 'tag', name: 'SVIP5', emoji: '5️⃣', event: true },
  { cat: 'tag', name: 'SVIP6', emoji: '6️⃣', event: true },

  ...RING_SKINS.map((r, i) => ({
    cat: 'ring',
    name: r.name,
    emoji: '💍',
    price: r.price,
    ringId: r.id,
    neu: i < 2,
    preview: r.metal.slice(0, 2),
  })),
];

export const SVIP_TIERS = ['SVIP 1-2', 'SVIP 3-4', 'SVIP 5-6', 'SVIP 7-8', 'SVIP 9-10', 'SVIP 11-12', 'SVIP 13-16'];

export const SVIP_PERKS = [
  { title: 'SVIP Tag', emoji: '🏷️', play: false },
  { title: 'SVIP Badge', emoji: '🐱', play: true },
  { title: 'Entry Tag', emoji: '🚪', play: true },
  { title: 'Mic Voice', emoji: '🎤', play: true },
  { title: 'Profile Card', emoji: '🪪', play: false },
  { title: 'Frame', emoji: '🖼️', play: false },
  { title: 'Bubble', emoji: '💬', play: false },
  { title: 'Dynamic', emoji: '✨', play: true },
  { title: 'Ride', emoji: '🚗', play: true },
];
