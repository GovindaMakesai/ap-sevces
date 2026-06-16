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
      return bal.settings || { min_withdrawal_coins: 500, coins_per_inr: 10 };
    }
  }

  function getCachedBalance() {
    return { ...cached };
  }

  async function sendGift(payload) {
    const res = await API.post('/wallet/gifts', payload);
    if (res.data?.balance) {
      cached = res.data.balance;
      document.dispatchEvent(new CustomEvent('wallet:balance', { detail: cached }));
    }
    return res;
  }

  async function submitRecharge(body) {
    return API.post('/wallet/recharge', body);
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

  window.SocialWallet = {
    fetchBalance,
    getCachedBalance,
    getWalletSettings,
    sendGift,
    submitRecharge,
    requestWithdraw,
    requestWithdrawWithQr,
    getWithdrawals,
    getWithdrawal,
    confirmWithdrawal,
    resolveUploadUrl,
  };

  document.addEventListener('wallet:balance', (e) => {
    cached = e.detail || cached;
  });
})();
