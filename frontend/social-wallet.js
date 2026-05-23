/**
 * Backend wallet client — balances always from DB, never localStorage.
 */
(function () {
  let cached = { coin_balance: 0, star_balance: 0 };
  let lastFetch = 0;

  async function fetchBalance(force) {
    if (!window.API || !localStorage.getItem('token')) return cached;
    if (!force && Date.now() - lastFetch < 4000) return cached;
    try {
      const res = await API.get('/wallet/balance');
      cached = res.data || cached;
      lastFetch = Date.now();
      document.dispatchEvent(new CustomEvent('wallet:balance', { detail: cached }));
      return cached;
    } catch (_e) {
      return cached;
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

  window.SocialWallet = {
    fetchBalance,
    getCachedBalance,
    sendGift,
    submitRecharge,
    requestWithdraw,
  };

  document.addEventListener('wallet:balance', (e) => {
    cached = e.detail || cached;
  });
})();
