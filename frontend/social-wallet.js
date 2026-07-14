/**
 * Backend wallet client — balances always from DB, never localStorage.
 */
(function () {
  let cached = {
    coin_balance: 0,
    star_balance: 0,
    gift_inventory_coins: 0,
    sell_inventory_coins: 0,
    giftable_coins: 0,
    sellable_coins: 0,
  };
  let lastFetch = 0;

  function normalizeBalance(data, prev) {
    const base = prev || cached;
    const coin_balance = Number(data.coin_balance ?? base.coin_balance) || 0;
    const gift_inventory_coins = Number(data.gift_inventory_coins ?? base.gift_inventory_coins) || 0;
    const sell_inventory_coins = Number(
      data.sell_inventory_coins ?? data.inventory_coins ?? base.sell_inventory_coins
    ) || 0;
    const giftable_coins =
      data.giftable_coins != null
        ? Number(data.giftable_coins) || 0
        : coin_balance + gift_inventory_coins;
    const sellable_coins =
      data.sellable_coins != null
        ? Number(data.sellable_coins) || 0
        : sell_inventory_coins + coin_balance;
    return {
      coin_balance,
      star_balance: Number(data.star_balance ?? base.star_balance) || 0,
      gift_inventory_coins,
      sell_inventory_coins,
      inventory_coins: sell_inventory_coins,
      giftable_coins,
      sellable_coins,
      settings: data.settings ?? base.settings,
    };
  }

  function resolveUploadUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const base = (window.CONFIG && CONFIG.BACKEND_URL) || '';
    return base + (path.startsWith('/') ? path : '/' + path);
  }

  function invalidateBalance() {
    lastFetch = 0;
  }

  async function fetchBalance(force) {
    if (!window.API) return cached;
    if (window.Auth?.hasSession && !Auth.hasSession()) return cached;
    if (window.Auth?.ensureAccessToken) await Auth.ensureAccessToken();
    if (!Auth.getToken?.() && !localStorage.getItem('token')) return cached;
    if (!force && Date.now() - lastFetch < 4000) return cached;
    try {
      const res = await API.get('/wallet/balance');
      const data = res.data || {};
      cached = normalizeBalance(data, cached);
      lastFetch = Date.now();
      document.dispatchEvent(new CustomEvent('wallet:balance', { detail: cached }));
      return cached;
    } catch (_e) {
      return cached;
    }
  }

  async function getWalletSettings() {
    try {
      const res = await API.get('/wallet/settings');
      return res.data || {};
    } catch (_e) {
      const bal = await fetchBalance();
      return bal.settings || {
        min_withdrawal_usd: 10,
        min_withdrawal_coins: 100000,
        withdrawal_points_per_usd: 10000,
        withdrawal_service_fee_pct: 8,
        coins_per_inr: 10,
        inr_per_usd: 94,
        exchange_points_block: 100000,
        exchange_coins_per_10k_points: 7000,
      };
    }
  }

  function getCachedBalance() {
    return { ...cached };
  }

  /** Points earned (separate from purchasable coins). */
  function getPointsBalance(bal) {
    const b = bal || cached;
    return Number(b.star_balance) || 0;
  }

  function getCoinsBalance(bal) {
    const b = bal || cached;
    return Number(b.coin_balance) || 0;
  }

  /** Coins available to send gifts (wallet + seller gift stock). */
  function getGiftableCoins(bal) {
    const b = bal || cached;
    if (b.giftable_coins != null) return Number(b.giftable_coins) || 0;
    return (Number(b.coin_balance) || 0) + (Number(b.gift_inventory_coins) || 0);
  }

  /** Coins sellers can transfer to users (sell stock + wallet). */
  function getSellableCoins(bal) {
    const b = bal || cached;
    if (b.sellable_coins != null) return Number(b.sellable_coins) || 0;
    return (Number(b.sell_inventory_coins || b.inventory_coins) || 0) + (Number(b.coin_balance) || 0);
  }

  async function sendGift(payload) {
    const res = await API.post('/wallet/gifts', payload);
    const inner = res?.data || res;
    const balance = inner?.balance || inner?.sender_balance;
    if (balance && typeof balance === 'object') {
      cached = normalizeBalance(balance, cached);
      lastFetch = Date.now();
      document.dispatchEvent(new CustomEvent('wallet:balance', { detail: cached }));
    } else {
      await fetchBalance(true);
    }
    return res;
  }

  async function submitRecharge(body, proofFile) {
    if (proofFile) {
      const fd = new FormData();
      fd.append('amount_inr', String(body.amount_inr));
      fd.append('transaction_id', body.transaction_id);
      fd.append('payment_method', body.payment_method || 'qr_manual');
      fd.append('payment_proof', proofFile);
      return API.post('/wallet/recharge', fd);
    }
    return API.post('/wallet/recharge', body);
  }

  async function getRecharges() {
    return API.get('/wallet/recharges');
  }

  async function requestWithdraw(amount) {
    const res = await API.post('/wallet/withdraw', { amount });
    await fetchBalance(true);
    return res;
  }

  async function requestWithdrawWithQr(amount, qrFile) {
    const fd = new FormData();
    fd.append('amount', String(amount));
    fd.append('qr_image', qrFile);
    const res = await API.post('/wallet/withdraw', fd);
    await fetchBalance(true);
    return res;
  }

  async function getWithdrawals() {
    return API.get('/wallet/withdrawals');
  }

  async function getWithdrawal(id) {
    return API.get(`/wallet/withdrawals/${id}`);
  }

  async function confirmWithdrawal(id) {
    const res = await API.post(`/wallet/withdrawals/${id}/confirm`, {});
    await fetchBalance(true);
    return res;
  }

  async function exchangePointsToCoins(points) {
    const res = await API.post('/wallet/exchange-points', { points: Number(points) });
    await fetchBalance(true);
    return res;
  }

  window.SocialWallet = {
    fetchBalance,
    invalidateBalance,
    getCachedBalance,
    getPointsBalance,
    getCoinsBalance,
    getGiftableCoins,
    getSellableCoins,
    getWalletSettings,
    sendGift,
    submitRecharge,
    getRecharges,
    requestWithdraw,
    requestWithdrawWithQr,
    getWithdrawals,
    getWithdrawal,
    confirmWithdrawal,
    exchangePointsToCoins,
    resolveUploadUrl,
  };

  document.addEventListener('wallet:balance', (e) => {
    cached = e.detail || cached;
  });
})();
