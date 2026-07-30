/**
 * Tunable For You ranking weights.
 * Change constants here — do not hardcode scores in SQL callers.
 */
module.exports = {
  /** Hours until recency factor halves (approx via exp decay) */
  RECENCY_HALF_LIFE_HOURS: Number(process.env.SOCIAL_FEED_HALF_LIFE_HOURS) || 36,
  LIKE_WEIGHT: Number(process.env.SOCIAL_FEED_LIKE_WEIGHT) || 3,
  COMMENT_WEIGHT: Number(process.env.SOCIAL_FEED_COMMENT_WEIGHT) || 5,
  SHARE_WEIGHT: Number(process.env.SOCIAL_FEED_SHARE_WEIGHT) || 4,
  BASE_SCORE: Number(process.env.SOCIAL_FEED_BASE_SCORE) || 1,
};
