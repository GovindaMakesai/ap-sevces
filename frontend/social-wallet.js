/**
 * Backend wallet client — balances always from DB, never localStorage.
 */
(function () {
  let cached = { coin_balance: 0, star_balance: 0 };
  let lastFetch = 0;

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
      cached = {
        coin_balance: data.coin_balance ?? cached.coin_balance,
        star_balance: data.star_balance ?? cached.star_balance,
        settings: data.settings,
      };
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

  async function sendGift(payload) {
    const res = await API.post('/wallet/gifts', payload);
    const inner = res?.data || res;
    const balance = inner?.balance;
    if (balance && typeof balance === 'object') {
      cached = {
        coin_balance: balance.coin_balance ?? cached.coin_balance,
        star_balance: balance.star_balance ?? cached.star_balance,
      };
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
