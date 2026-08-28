/**
 * Same AnimStream catalog as frontend/gift-animation-config.js.
 * Do not invent fallback clips — unknown gifts stay emoji-only.
 */
export const DEFAULT_DURATION_MS = 16000;

export const ANIMATED_GIFTS = [
  {
    slug: 'imperial_bloom_10000',
    name: 'Imperial Bloom',
    token: 'cmsx8mxo8aj0q01tjgn9ffq2r',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/interstellar-animation/poster.jpg',
    price: 10000,
    emoji: '\u{1F33A}',
  },
  {
    slug: 'crystal_rose_5000',
    name: 'Crystal Rose',
    token: 'cmsx9cxtyaljv01tj86aoe2ir',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/rosen-x3-match/poster.png',
    price: 5000,
    emoji: '\u{1F48E}',
  },
  {
    slug: 'golden_rose_3000',
    name: 'Golden Rose',
    token: 'cmsx9carealj501tj3s259zej',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/backround-green-drago/poster.png',
    price: 3000,
    emoji: '\u{1F338}',
  },
  {
    slug: 'fireworks_5000',
    name: 'Fireworks',
    token: 'cmsx9bj0galhu01tjw5rbph77',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/money-gun-panda/poster.png',
    price: 5000,
    emoji: '\u{1F386}',
  },
  {
    slug: 'royal_crown_10000',
    name: 'Royal Crown',
    token: 'cmsx9asycalh401tj4ms9626k',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/bhne-dj-kollektion/poster.png',
    price: 10000,
    emoji: '\u{1F451}',
  },
  {
    slug: 'jackpot_gem_10000',
    name: 'Jackpot Gem',
    token: 'cmsx993cralf401tjdts2sr27',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/teamherz-animation-2/poster.png',
    price: 10000,
    emoji: '\u{1F48E}',
  },
  {
    slug: 'heart_me_8000',
    name: 'Heart Me',
    token: 'cmsxkc4qobjjn01tjmq0az9zz',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/tiktok-animation-heart-me/poster.png',
    price: 8000,
    emoji: '\u2764\uFE0F',
  },
  {
    slug: 'portugal_galo_12000',
    name: 'Portugal Galo',
    token: 'cmsx9v8z0alzl01tje4ehexzr',
    thumbnailUrl:
      'https://animstream.b-cdn.net/thumbs/wm-portugal-pokal-galo-de-barcelos-for-free/poster.png',
    price: 12000,
    emoji: '\u{1F3C6}',
  },
  {
    slug: 'walley_surfer_12000',
    name: 'Walley Surfer',
    token: 'cmsx9uid3alyw01tjcvdinmnz',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/walley-surfer/poster.png',
    price: 12000,
    emoji: '\u{1F3C4}',
  },
  {
    slug: 'panda_bath_10000',
    name: 'Panda Bath',
    token: 'cmsx9ts90alyj01tjftpqy1pm',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/panda-badewanne/poster.png',
    price: 10000,
    emoji: '\u{1F43C}',
  },
  {
    slug: 'ghost_x_15000',
    name: 'Ghost X',
    token: 'cmsx9p86maluj01tj14qru8jr',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/ghost-x/poster.png',
    price: 15000,
    emoji: '\u{1F47B}',
  },
  {
    slug: 'austria_heart_10000',
    name: 'Austria Heart',
    token: 'cmsx9n3caalss01tj5nzdyq4g',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/sterreich-team-herz/poster.png',
    price: 10000,
    emoji: '\u2764\uFE0F',
  },
  {
    slug: 'neon_koi_15000',
    name: 'Neon Koi',
    token: 'cmsx9h5t9alny01tj7nt0uv4e',
    thumbnailUrl:
      'https://animstream.b-cdn.net/thumbs/neon-holographic-koi-3d-stardust-waterfall-alert-free/poster.png',
    price: 15000,
    emoji: '\u{1F420}',
  },
  {
    slug: 'not_the_car_20000',
    name: 'Not The Car',
    token: 'cmsx9go4galnk01tjvqjn8sst',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/its-not-the-car-its-the-driver/poster.png',
    price: 20000,
    emoji: '\u{1F697}',
  },
  {
    slug: 'little_booster_8000',
    name: 'Little Booster',
    token: 'cmsx9ftk5alms01tjo4sdnp8x',
    thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/little-booster/poster.png',
    price: 8000,
    emoji: '\u{1F680}',
  },
];

export function giftEmbedUrl(token) {
  const t = String(token || '').trim();
  return t ? `https://animstream.com/embed/${t}` : '';
}

function giftSlugOf(gift) {
  return String(
    gift?.slug || gift?.giftSlug || gift?.giftType || gift?.gift_type || gift?.type || ''
  ).trim();
}

export function resolveGiftAnim(gift) {
  if (!gift) return null;
  const slug = giftSlugOf(gift);
  const token = String(gift.animToken || gift.token || '').trim();
  const hit =
    (slug && ANIMATED_GIFTS.find((g) => g.slug === slug)) ||
    (token && ANIMATED_GIFTS.find((g) => g.token === token)) ||
    null;
  if (!hit) {
    return {
      title: gift.name || gift.giftName || 'Gift',
      slug,
      token: '',
      embedUrl: '',
      thumbnailUrl: gift.thumbnailUrl || gift.thumb_url || gift.icon_url || gift.image || '',
    };
  }
  return {
    ...hit,
    title: hit.name,
    embedUrl: giftEmbedUrl(hit.token),
    thumbnailUrl: gift.thumbnailUrl || hit.thumbnailUrl,
  };
}

/** @deprecated alias — use ANIMATED_GIFTS */
export const STREAM_GIFT_ANIMS = ANIMATED_GIFTS;
