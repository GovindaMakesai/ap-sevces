/**
 * Gift animation URLs and matchers — client presentation only.
 * Do not use these constants for coin deduction or server validation.
 */
(function (g) {
  g.AP_GIFT_ANIMATION = {
    /** TEST: loop embed — switch to AnimStream "Play Once" embed in production when available */
    ANIMSTREAM_10000_GIFT_URL:
      'https://animstream.com/embed/cmsx8mxo8aj0q01tjgn9ffq2r?loop=1',
    /** Primary matcher: Imperial Bloom (flowers tab, 10,000 coins) */
    GIFT_ANIMATION_10000_SLUG: 'imperial_bloom_10000',
    /** TEST fallback when slug missing from socket payload */
    USE_COIN_VALUE_10000_FALLBACK: false,
    GIFT_ANIMATION_10000_COIN_VALUE: 10000,
    /** Safety timeout while loop=1 embed is used for the initial test */
    GIFT_ANIMATION_10000_DURATION_MS: 15000,
  };
})(typeof window !== 'undefined' ? window : global);
