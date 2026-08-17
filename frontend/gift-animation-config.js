/**
 * AnimStream gift animation mappings for live gifts (presentation only).
 * Each URL is wired to a catalog gift slug so confirmed live:gift events can play the embed.
 */
(function (g) {
  const ANIM_URLS = {
    anim1: 'https://animstream.com/embed/cmsx8mxo8aj0q01tjgn9ffq2r?loop=1',
    anim2: 'https://animstream.com/embed/cmsx9cxtyaljv01tj86aoe2ir?loop=1',
    anim3: 'https://animstream.com/embed/cmsx9carealj501tj3s259zej?loop=1',
    anim4: 'https://animstream.com/embed/cmsx9bj0galhu01tjw5rbph77?loop=1',
    anim5: 'https://animstream.com/embed/cmsx9asycalh401tj4ms9626k?loop=1',
    anim6: 'https://animstream.com/embed/cmsx993cralf401tjdts2sr27?loop=1',
  };

  const GIFT_BINDINGS = [
    { slug: 'imperial_bloom_10000', name: 'Imperial Bloom', cost: 10000, emoji: '\u{1F33A}', anim: 'anim1' },
    { slug: 'crystal_rose_5000', name: 'Crystal Rose', cost: 5000, emoji: '\u{1F48E}', anim: 'anim2' },
    { slug: 'golden_rose_3000', name: 'Golden Rose', cost: 3000, emoji: '\u{1F338}', anim: 'anim3' },
    { slug: 'fireworks_5000', name: 'Fireworks', cost: 5000, emoji: '\u{1F386}', anim: 'anim4' },
    { slug: 'royal_crown_10000', name: 'Royal Crown', cost: 10000, emoji: '\u{1F451}', anim: 'anim5' },
    { slug: 'jackpot_gem_10000', name: 'Jackpot Gem', cost: 10000, emoji: '\u{1F48E}', anim: 'anim6' },
  ];

  const DEFAULT_DURATION_MS = 15000;

  const GIFT_ANIMATION_MAP = {};
  const CATALOG_BY_SLUG = {};

  GIFT_BINDINGS.forEach((gift, i) => {
    const animationUrl = ANIM_URLS[gift.anim] || ANIM_URLS.anim1;
    GIFT_ANIMATION_MAP[gift.slug] = {
      animationUrl,
      label: `Animation ${i + 1}`,
      giftName: gift.name,
      coinValue: gift.cost,
      emoji: gift.emoji,
      durationMs: DEFAULT_DURATION_MS,
    };
    CATALOG_BY_SLUG[gift.slug] = {
      slug: gift.slug,
      name: gift.name,
      cost: gift.cost,
      emoji: gift.emoji,
    };
  });

  g.AP_GIFT_ANIMATION = {
    GIFT_ANIMATION_MAP,
    CATALOG_BY_SLUG,
    GIFT_BINDINGS,
    ANIM_URLS,
    TEST_ANIMATIONS: GIFT_BINDINGS.map((gift, i) => ({
      slug: gift.slug,
      name: gift.name,
      cost: gift.cost,
      emoji: gift.emoji,
      animationUrl: ANIM_URLS[gift.anim],
      label: `Animation ${i + 1}`,
    })),
    DEFAULT_DURATION_MS,
    MAX_QUEUE_SIZE: 8,
    ANIM1_TEST_URL: ANIM_URLS.anim1,
  };
})(typeof window !== 'undefined' ? window : global);
