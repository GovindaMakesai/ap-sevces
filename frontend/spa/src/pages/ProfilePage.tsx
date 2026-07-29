import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import {
  mediaUrl,
  type SocialStatsResponse,
  type WalletBalance,
  type WalletResponse,
} from '@/api/types';
import { useAuthStore, type ApUser } from '@/stores/authStore';
import { useWalletStore } from '@/stores/uiStore';
import { useSpaNavigate } from '@/nav/useSpaNavigate';
import { useEffect } from 'react';

type MeResponse = { success?: boolean; data?: { user?: ApUser } };

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  href: string;
  show?: (u: ApUser | null, w: WalletBalance | null) => boolean;
};

const MENU: MenuItem[] = [
  { id: 'invite', label: 'Invite', icon: 'fa-gift', href: '/referral.html?app=1' },
  { id: 'topup', label: 'Top Up', icon: 'fa-coins', href: '/coins-recharge.html?app=1' },
  { id: 'withdraw', label: 'Withdraw', icon: 'fa-money-bill-wave', href: '/withdraw.html?app=1' },
  { id: 'store', label: 'Store', icon: 'fa-store', href: '/store.html?app=1' },
  { id: 'vip', label: 'VIP Privileges', icon: 'fa-crown', href: '/vip.html?app=1' },
  { id: 'rankings', label: 'Rankings', icon: 'fa-trophy', href: '/rankings.html' },
  { id: 'messages', label: 'Messages', icon: 'fa-comments', href: '/chat.html' },
  {
    id: 'host',
    label: 'Host / Streamer Center',
    icon: 'fa-video',
    href: '/streamer-center.html?app=1',
  },
  {
    id: 'agency',
    label: 'Agency Center',
    icon: 'fa-building',
    href: '/agency-center.html?app=1',
    show: (u) => {
      const role = String(u?.role || '').toLowerCase();
      return role.includes('agency') || Boolean(u?.is_admin);
    },
  },
  { id: 'help', label: 'Help', icon: 'fa-question-circle', href: '/help.html?app=1' },
];

/**
 * Native Profile — auth/wallet/stats in shell state; deep links via SPA → legacy bridge.
 */
export function ProfilePage() {
  const go = useSpaNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const setBalances = useWalletStore((s) => s.setBalances);
  const coins = useWalletStore((s) => s.coins);
  const points = useWalletStore((s) => s.points);

  const hasToken = Boolean(token || (typeof localStorage !== 'undefined' && localStorage.getItem('token')));

  const meQ = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await apiFetch<MeResponse>('/auth/me');
      const u = res?.data?.user;
      if (u && typeof u === 'object' && 'id' in u) {
        setSession(u, token || localStorage.getItem('token'));
      }
      return res;
    },
    enabled: hasToken,
    staleTime: 120_000,
  });

  const walletQ = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const res = await apiFetch<WalletResponse>('/wallet/balance');
      return res?.data || null;
    },
    enabled: hasToken,
    staleTime: 60_000,
  });

  const uid = user?.id || meQ.data?.data?.user?.id;

  const statsQ = useQuery({
    queryKey: ['social-stats', uid],
    queryFn: () => apiFetch<SocialStatsResponse>(`/social/stats/${uid}`),
    enabled: Boolean(uid),
    staleTime: 120_000,
  });

  useEffect(() => {
    const b = walletQ.data;
    if (!b) return;
    setBalances({
      coins: Number(b.coin_balance ?? 0),
      points: Number(b.star_balance ?? 0),
      giftCoins: Number(b.gift_inventory_coins ?? b.giftable_coins ?? 0),
    });
  }, [walletQ.data, setBalances]);

  const u = user || meQ.data?.data?.user || null;
  const displayName =
    [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() ||
    (u?.email ? String(u.email).split('@')[0] : 'Guest');
  const avatar =
    mediaUrl(u?.profile_pic as string | null | undefined, u?.id) ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=ff2d55&color=fff`;

  if (!hasToken) {
    return (
      <div className="ap-page ap-page-profile ap-native-profile">
        <div className="ap-muted-center">
          <p>Sign in to view your profile.</p>
          <button type="button" className="ap-btn" onClick={() => go('/app-auth.html?app=1')}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const followers = Number(statsQ.data?.data?.followers ?? 0);
  const following = Number(statsQ.data?.data?.following ?? 0);
  const coinVal = coins ?? Number(walletQ.data?.coin_balance ?? 0);
  const pointVal = points ?? Number(walletQ.data?.star_balance ?? 0);

  return (
    <div className="ap-page ap-page-profile ap-native-profile">
      <div className="ap-profile-scroll">
        <header className="ap-profile-head">
          <img className="ap-profile-av" src={avatar} alt="" />
          <div className="ap-profile-id">
            <h1>{displayName}</h1>
            {u?.display_id != null ? <p className="ap-profile-did">ID {String(u.display_id)}</p> : null}
            {u?.role ? <span className="ap-role-pill">{String(u.role)}</span> : null}
          </div>
        </header>

        <div className="ap-profile-stats">
          <div>
            <strong>{following}</strong>
            <span>Following</span>
          </div>
          <div>
            <strong>{followers}</strong>
            <span>Followers</span>
          </div>
          <button type="button" onClick={() => go('/store.html?app=1')}>
            <strong>{coinVal}</strong>
            <span>Coins</span>
          </button>
          <button type="button" onClick={() => go('/points.html?app=1')}>
            <strong>{pointVal}</strong>
            <span>Points</span>
          </button>
        </div>

        <div className="ap-profile-actions">
          <button type="button" className="ap-btn" onClick={() => go('/coins-recharge.html?app=1')}>
            Top Up
          </button>
          <button type="button" className="ap-btn ap-btn-ghost" onClick={() => go('/withdraw.html?app=1')}>
            Withdraw
          </button>
        </div>

        <nav className="ap-profile-menu" aria-label="Profile">
          {MENU.filter((m) => !m.show || m.show(u, walletQ.data ?? null)).map((m) => (
            <button key={m.id} type="button" className="ap-menu-row" onClick={() => go(m.href)}>
              <i className={`fas ${m.icon}`} aria-hidden />
              <span>{m.label}</span>
              <i className="fas fa-chevron-right ap-chevron" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            className="ap-menu-row ap-menu-danger"
            onClick={() => {
              clearSession();
              go('/app-auth.html?app=1', { replace: true });
            }}
          >
            <i className="fas fa-sign-out-alt" aria-hidden />
            <span>Logout</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
