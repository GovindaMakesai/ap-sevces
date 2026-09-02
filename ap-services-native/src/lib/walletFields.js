/** Normalize wallet API fields (backend uses star_balance for points). */
export function normalizeWalletBalance(data = {}) {
  const coin_balance = Number(data.coin_balance ?? data.coins ?? data.diamonds ?? 0) || 0;
  const star_balance =
    Number(data.star_balance ?? data.points ?? data.point_balance ?? data.beans ?? data.stars ?? 0) || 0;
  const gift_inventory_coins = Number(data.gift_inventory_coins ?? 0) || 0;
  const sell_inventory_coins = Number(data.sell_inventory_coins ?? data.inventory_coins ?? 0) || 0;
  const is_coin_seller = !!data.is_coin_seller;
  const giftable_coins =
    data.giftable_coins != null
      ? Number(data.giftable_coins) || 0
      : is_coin_seller
        ? gift_inventory_coins
        : coin_balance;
  const sellable_coins =
    data.sellable_coins != null ? Number(data.sellable_coins) || 0 : sell_inventory_coins + coin_balance;
  return {
    ...data,
    coin_balance,
    star_balance,
    gift_inventory_coins,
    sell_inventory_coins,
    is_coin_seller,
    giftable_coins,
    sellable_coins,
    settings: data.settings,
  };
}

/** Profile "Coins" — sellers see sellable pool; normal users see wallet coins. */
export function walletCoins(data = {}) {
  const b = normalizeWalletBalance(data);
  if (b.is_coin_seller) return b.sellable_coins;
  return b.coin_balance;
}

/** Wallet NR coins only (excludes seller stock). */
export function walletWalletCoins(data = {}) {
  return normalizeWalletBalance(data).coin_balance;
}

export function walletPoints(data = {}) {
  return normalizeWalletBalance(data).star_balance;
}

/** Gift stock for sellers, wallet coins for normal users. */
export function walletGiftCoins(data = {}) {
  return normalizeWalletBalance(data).giftable_coins;
}

export const DEFAULT_WALLET_SETTINGS = {
  min_withdrawal_usd: 10,
  min_withdrawal_coins: 100000,
  withdrawal_points_per_usd: 10000,
  withdrawal_service_fee_pct: 8,
  coins_per_inr: 10,
  inr_per_usd: 94,
  exchange_points_block: 100000,
  exchange_coins_per_10k_points: 7000,
  points_transfer_block: 100000,
  points_transfer_service_fee_pct: 3,
  points_transfer_daily_limit: 5,
};

export function mergeWalletSettings(settings) {
  return { ...DEFAULT_WALLET_SETTINGS, ...(settings || {}) };
}

export function estimatePayout(points, settings = {}) {
  const s = mergeWalletSettings(settings);
  const pts = Number(points) || 0;
  if (!pts) return null;
  const ptsPerUsd = Number(s.withdrawal_points_per_usd) || 10000;
  const feePct = Number(s.withdrawal_service_fee_pct) || 8;
  const grossUsd = pts / ptsPerUsd;
  const feeUsd = grossUsd * (feePct / 100);
  const netUsd = grossUsd - feeUsd;
  const inrPerUsd = Number(s.inr_per_usd) || 94;
  const grossInr = grossUsd * inrPerUsd;
  const feeInr = grossInr * (feePct / 100);
  const netInr = grossInr - feeInr;
  return { grossUsd, feeUsd, netUsd, grossInr, feeInr, netInr, feePct };
}

export function estimateExchange(points, settings = {}) {
  const s = mergeWalletSettings(settings);
  const pts = Number(points) || 0;
  if (!pts) return 0;
  const block = Number(s.exchange_points_block) || 100000;
  const coinsPer10k = Number(s.exchange_coins_per_10k_points) || 7000;
  return Math.floor((pts / block) * coinsPer10k);
}

export function estimateTransferFee(points, settings = {}) {
  const s = mergeWalletSettings(settings);
  const pts = Number(points) || 0;
  const pct = Number(s.points_transfer_service_fee_pct) || 3;
  return Math.floor(pts * (pct / 100));
}

export function estimateTransferNet(points, settings = {}) {
  const pts = Number(points) || 0;
  return Math.max(0, pts - estimateTransferFee(points, settings));
}
