/**
 * AnimStream gift animation mapping — presentation only (not used for coin logic).
 * Gift IDs are catalog slugs from live-emoji-data.js (giftSlugFor).
 */
(function (g) {
  const ANIM_URLS = [
    'https://animstream.com/embed/cmsx8mxo8aj0q01tjgn9ffq2r?loop=1',
    'https://animstream.com/embed/cmsx9cxtyaljv01tj86aoe2ir?loop=1',
    'https://animstream.com/embed/cmsx9carealj501tj3s259zej?loop=1',
    'https://animstream.com/embed/cmsx9bj0galhu01tjw5rbph77?loop=1',
    'https://animstream.com/embed/cmsx9asycalh401tj4ms9626k?loop=1',
    'https://animstream.com/embed/cmsx993cralf401tjdts2sr27?loop=1',
  ];

  /** Existing catalog gifts — slug = name_slug + _ + cost */
  const GIFT_BINDINGS = [
    { slug: 'imperial_bloom_10000', name: 'Imperial Bloom', cost: 10000, emoji: '\u{1F33A}' },
    { slug: 'jackpot_gem_10000', name: 'Jackpot Gem', cost: 10000, emoji: '\u{1F48E}' },
    { slug: 'royal_crown_10000', name: 'Royal Crown', cost: 10000, emoji: '\u{1F451}' },
    { slug: 'christmas_star_25000', name: 'Christmas Star', cost: 25000, emoji: '\u{1F384}' },
    { slug: 'diamond_watch_100000', name: 'Diamond Watch', cost: 100000, emoji: '\u231A' },
    { slug: 'fire_dragon_1000000', name: 'Fire Dragon', cost: 1000000, emoji: '\u{1F432}' },
  ];

  const GIFT_ANIMATION_MAP = {};
  const CATALOG_BY_SLUG = {};

  GIFT_BINDINGS.forEach((gift, i) => {
    const animationUrl = ANIM_URLS[i] || '';
    GIFT_ANIMATION_MAP[gift.slug] = {
      animationUrl,
      label: `Animation ${i + 1}`,
      giftName: gift.name,
      coinValue: gift.cost,
      emoji: gift.emoji,
      durationMs: 15000,
    };
    CATALOG_BY_SLUG[gift.slug] = { ...gift };
  });

  g.AP_GIFT_ANIMATION = {
    GIFT_ANIMATION_MAP,
    CATALOG_BY_SLUG,
    GIFT_BINDINGS,
    /** Safety timeout while loop=1 embeds are used for testing */
    DEFAULT_DURATION_MS: 15000,
    MAX_QUEUE_SIZE: 8,
  };
})(typeof window !== 'undefined' ? window : global);
