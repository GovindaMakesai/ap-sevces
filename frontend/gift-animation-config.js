/**
 * AnimStream gift animation catalog — single source of truth for live gift overlays.
 * Store cards use thumbnailUrl; live overlay uses animationEmbedUrl (never interchange).
 */
(function (g) {
  /* AnimStream clips are typically 8–15s; 5s was tearing them down mid-play. */
  const DEFAULT_DURATION_MS = 16000;
  const MAX_QUEUE_SIZE = 8;
  const LOOP = '';

  function compactThumbUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      /* Bunny Optimizer query params broke posters in the app WebView. Use the file as-is. */
      if (/b-cdn\.net$|animstream/i.test(u.hostname)) {
        u.search = '';
      }
      return u.href;
    } catch (_e) {
      return raw;
    }
  }

  function embedUrl(token) {
    return `https://animstream.com/embed/${token}${LOOP}`;
  }

  /** 14 unique purchased AnimStream embeds (cmsx9go4galnk listed once). */
  const ANIMATED_GIFTS = [
    {
      id: 'anim_imperial_bloom',
      slug: 'imperial_bloom_10000',
      name: 'Imperial Bloom',
      token: 'cmsx8mxo8aj0q01tjgn9ffq2r',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/interstellar-animation/poster.jpg',
      price: 10000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F33A}',
      tag: 'VIP',
      active: true,
      sortOrder: 1,
    },
    {
      id: 'anim_crystal_rose',
      slug: 'crystal_rose_5000',
      name: 'Crystal Rose',
      token: 'cmsx9cxtyaljv01tj86aoe2ir',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/rosen-x3-match/poster.png',
      price: 5000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F48E}',
      tag: 'VIP',
      active: true,
      sortOrder: 2,
    },
    {
      id: 'anim_golden_rose',
      slug: 'golden_rose_3000',
      name: 'Golden Rose',
      token: 'cmsx9carealj501tj3s259zej',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/backround-green-drago/poster.png',
      price: 3000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F338}',
      active: true,
      sortOrder: 3,
    },
    {
      id: 'anim_fireworks',
      slug: 'fireworks_5000',
      name: 'Fireworks',
      token: 'cmsx9bj0galhu01tjw5rbph77',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/money-gun-panda/poster.png',
      price: 5000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F386}',
      tag: 'Hot',
      active: true,
      sortOrder: 4,
    },
    {
      id: 'anim_royal_crown',
      slug: 'royal_crown_10000',
      name: 'Royal Crown',
      token: 'cmsx9asycalh401tj4ms9626k',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/bhne-dj-kollektion/poster.png',
      price: 10000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F451}',
      tag: 'VIP',
      active: true,
      sortOrder: 5,
    },
    {
      id: 'anim_jackpot_gem',
      slug: 'jackpot_gem_10000',
      name: 'Jackpot Gem',
      token: 'cmsx993cralf401tjdts2sr27',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/teamherz-animation-2/poster.png',
      price: 10000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F48E}',
      tag: 'Lucky',
      active: true,
      sortOrder: 6,
    },
    {
      id: 'anim_heart_me',
      slug: 'heart_me_8000',
      name: 'Heart Me',
      token: 'cmsxkc4qobjjn01tjmq0az9zz',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/tiktok-animation-heart-me/poster.png',
      price: 8000,
      category: 'ANIMATED_GIFT',
      emoji: '\u2764\uFE0F',
      tag: 'New',
      active: true,
      sortOrder: 7,
    },
    {
      id: 'anim_portugal_galo',
      slug: 'portugal_galo_12000',
      name: 'Portugal Galo',
      token: 'cmsx9v8z0alzl01tje4ehexzr',
      thumbnailUrl:
        'https://animstream.b-cdn.net/thumbs/wm-portugal-pokal-galo-de-barcelos-for-free/poster.png',
      price: 12000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F3C6}',
      active: true,
      sortOrder: 8,
    },
    {
      id: 'anim_walley_surfer',
      slug: 'walley_surfer_12000',
      name: 'Walley Surfer',
      token: 'cmsx9uid3alyw01tjcvdinmnz',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/walley-surfer/poster.png',
      price: 12000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F3C4}',
      active: true,
      sortOrder: 9,
    },
    {
      id: 'anim_panda_bath',
      slug: 'panda_bath_10000',
      name: 'Panda Bath',
      token: 'cmsx9ts90alyj01tjftpqy1pm',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/panda-badewanne/poster.png',
      price: 10000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F43C}',
      active: true,
      sortOrder: 10,
    },
    {
      id: 'anim_ghost_x',
      slug: 'ghost_x_15000',
      name: 'Ghost X',
      token: 'cmsx9p86maluj01tj14qru8jr',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/ghost-x/poster.png',
      price: 15000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F47B}',
      active: true,
      sortOrder: 11,
    },
    {
      id: 'anim_austria_heart',
      slug: 'austria_heart_10000',
      name: 'Austria Heart',
      token: 'cmsx9n3caalss01tj5nzdyq4g',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/sterreich-team-herz/poster.png',
      price: 10000,
      category: 'ANIMATED_GIFT',
      emoji: '\u2764\uFE0F',
      active: true,
      sortOrder: 12,
    },
    {
      id: 'anim_neon_koi',
      slug: 'neon_koi_15000',
      name: 'Neon Koi',
      token: 'cmsx9h5t9alny01tj7nt0uv4e',
      thumbnailUrl:
        'https://animstream.b-cdn.net/thumbs/neon-holographic-koi-3d-stardust-waterfall-alert-free/poster.png',
      price: 15000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F420}',
      active: true,
      sortOrder: 13,
    },
    {
      id: 'anim_not_the_car',
      slug: 'not_the_car_20000',
      name: 'Not The Car',
      token: 'cmsx9go4galnk01tjvqjn8sst',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/its-not-the-car-its-the-driver/poster.png',
      price: 20000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F697}',
      active: true,
      sortOrder: 14,
    },
    {
      id: 'anim_little_booster',
      slug: 'little_booster_8000',
      name: 'Little Booster',
      token: 'cmsx9ftk5alms01tjo4sdnp8x',
      thumbnailUrl: 'https://animstream.b-cdn.net/thumbs/little-booster/poster.png',
      price: 8000,
      category: 'ANIMATED_GIFT',
      emoji: '\u{1F680}',
      active: true,
      sortOrder: 15,
    },
  ];

  const GIFT_ANIMATION_MAP = {};
  const CATALOG_BY_SLUG = {};
  const THUMBNAIL_BY_SLUG = {};
  const ANIM_URLS = {};
  const GIFT_BINDINGS = [];

  ANIMATED_GIFTS.forEach((gift, i) => {
    const animationEmbedUrl = embedUrl(gift.token);
    const durationMs = Number(gift.durationMs || DEFAULT_DURATION_MS);
    GIFT_ANIMATION_MAP[gift.slug] = {
      animationUrl: animationEmbedUrl,
      animationEmbedUrl,
      thumbnailUrl: compactThumbUrl(gift.thumbnailUrl),
      label: gift.name,
      giftName: gift.name,
      coinValue: gift.price,
      emoji: gift.emoji,
      durationMs,
      category: gift.category,
      active: gift.active,
      sortOrder: gift.sortOrder,
    };
    CATALOG_BY_SLUG[gift.slug] = {
      id: gift.id,
      slug: gift.slug,
      name: gift.name,
      cost: gift.price,
      emoji: gift.emoji,
      tag: gift.tag,
      thumbnailUrl: compactThumbUrl(gift.thumbnailUrl),
      animationEmbedUrl,
      category: gift.category,
      active: gift.active,
      sortOrder: gift.sortOrder,
    };
    THUMBNAIL_BY_SLUG[gift.slug] = compactThumbUrl(gift.thumbnailUrl);
    ANIM_URLS[`anim${i + 1}`] = animationEmbedUrl;
    GIFT_BINDINGS.push({
      slug: gift.slug,
      name: gift.name,
      cost: gift.price,
      emoji: gift.emoji,
      anim: `anim${i + 1}`,
    });
  });

  function getThumbnailUrl(slug) {
    const key = String(slug || '').trim();
    if (!key) return '';
    return THUMBNAIL_BY_SLUG[key] || GIFT_ANIMATION_MAP[key]?.thumbnailUrl || '';
  }

  function getAnimationUrl(slug) {
    const key = String(slug || '').trim();
    if (!key) return '';
    return GIFT_ANIMATION_MAP[key]?.animationEmbedUrl || GIFT_ANIMATION_MAP[key]?.animationUrl || '';
  }

  function getAnimatedGift(slug) {
    const key = String(slug || '').trim();
    return CATALOG_BY_SLUG[key] || null;
  }

  function mergeIntoLiveCatalog() {
    const cat = g.AP_LIVE_EMOJI?.GIFT_CATALOG;
    if (!cat) return;
    const animated = [];
    ANIMATED_GIFTS.forEach((gift) => {
      if (!gift.active) return;
      animated.push({
        slug: gift.slug,
        emoji: gift.emoji,
        name: gift.name,
        cost: gift.price,
        tag: gift.tag,
        thumbnailUrl: compactThumbUrl(gift.thumbnailUrl),
        animationEmbedUrl: embedUrl(gift.token),
        category: gift.category,
      });
    });
    cat.animated = animated;
    /* Keep AnimStream thumbs on the animated tab only — do not copy them into every catalog. */
  }

  if (typeof window !== 'undefined') {
    mergeIntoLiveCatalog();
  }

  const TEST_ANIMATIONS = ANIMATED_GIFTS.map((gift) => ({
    slug: gift.slug,
    name: gift.name,
    cost: gift.price,
    emoji: gift.emoji,
    animationUrl: embedUrl(gift.token),
    thumbnailUrl: compactThumbUrl(gift.thumbnailUrl),
    label: gift.name,
  }));

  g.AP_GIFT_ANIMATION = {
    ANIMATED_GIFTS,
    GIFT_ANIMATION_MAP,
    CATALOG_BY_SLUG,
    THUMBNAIL_BY_SLUG,
    GIFT_BINDINGS,
    ANIM_URLS,
    TEST_ANIMATIONS,
    DEFAULT_DURATION_MS,
    MAX_QUEUE_SIZE,
    ANIM1_TEST_URL: ANIM_URLS.anim1,
    getThumbnailUrl,
    getAnimationUrl,
    getAnimatedGift,
    compactThumbUrl,
    mergeIntoLiveCatalog,
  };
})(typeof window !== 'undefined' ? window : global);
