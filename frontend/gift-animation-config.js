/**
 * AnimStream embed mappings — disabled for now (re-enable when embeds are ready).
 * Live gifts use SocialFX cinematics from social-fx.js.
 */
(function (g) {
  g.AP_GIFT_ANIMATION = {
    GIFT_ANIMATION_MAP: {},
    CATALOG_BY_SLUG: {},
    GIFT_BINDINGS: [],
    ANIM_URLS: {},
    TEST_ANIMATIONS: [],
    DEFAULT_DURATION_MS: 15000,
    MAX_QUEUE_SIZE: 8,
    ANIM1_TEST_URL: null,
  };
})(typeof window !== 'undefined' ? window : global);
