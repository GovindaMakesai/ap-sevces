/**
 * AnimStream gift animation — single test mapping (Imperial Bloom 10k).
 * Presentation only; not used for coin deduction.
 */
(function (g) {
  const IMPERIAL_BLOOM = {
    slug: 'imperial_bloom_10000',
    name: 'Imperial Bloom',
    cost: 10000,
    emoji: '\u{1F33A}',
  };

  const ANIM1_URL = 'https://animstream.com/embed/cmsx8mxo8aj0q01tjgn9ffq2r?loop=1';

  const GIFT_BINDINGS = [IMPERIAL_BLOOM];

  const GIFT_ANIMATION_MAP = {
    [IMPERIAL_BLOOM.slug]: {
      animationUrl: ANIM1_URL,
      label: 'Animation 1',
      giftName: IMPERIAL_BLOOM.name,
      coinValue: IMPERIAL_BLOOM.cost,
      emoji: IMPERIAL_BLOOM.emoji,
      durationMs: 15000,
    },
  };

  const CATALOG_BY_SLUG = {
    [IMPERIAL_BLOOM.slug]: { ...IMPERIAL_BLOOM },
  };

  g.AP_GIFT_ANIMATION = {
    GIFT_ANIMATION_MAP,
    CATALOG_BY_SLUG,
    GIFT_BINDINGS,
    DEFAULT_DURATION_MS: 15000,
    MAX_QUEUE_SIZE: 8,
    ANIM1_TEST_URL: ANIM1_URL,
  };
})(typeof window !== 'undefined' ? window : global);
