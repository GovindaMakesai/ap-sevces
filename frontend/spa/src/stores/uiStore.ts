import { create } from 'zustand';

type WalletState = {
  coins: number | null;
  giftCoins: number | null;
  points: number | null;
  setBalances: ( partial: Partial<Pick<WalletState, 'coins' | 'giftCoins' | 'points'>> ) => void;
};

export const useWalletStore = create<WalletState>((set) => ({
  coins: null,
  giftCoins: null,
  points: null,
  setBalances: (partial) => set(partial),
}));

type UiState = {
  chatUnread: number;
  setChatUnread: (n: number) => void;
};

export const useUiStore = create<UiState>((set) => ({
  chatUnread: (() => {
    try {
      return Number(localStorage.getItem('chat_unread') || 0) || 0;
    } catch {
      return 0;
    }
  })(),
  setChatUnread: (n) => {
    try {
      localStorage.setItem('chat_unread', String(Math.max(0, n)));
    } catch {
      /* ignore */
    }
    set({ chatUnread: Math.max(0, n) });
  },
}));
