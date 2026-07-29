import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useSpaNavigate } from '@/nav/useSpaNavigate';
import { useAuthStore } from '@/stores/authStore';

type NotifSettings = {
  email_enabled?: boolean;
  push_enabled?: boolean;
  sms_enabled?: boolean;
  booking_updates?: boolean;
  payment_updates?: boolean;
  review_updates?: boolean;
  promotional_updates?: boolean;
  reminder_updates?: boolean;
};

type SettingsResponse = { success?: boolean; data?: NotifSettings };

const LINKS = [
  { id: 'help', label: 'Help & Support', icon: 'fa-question-circle', href: '/help.html?app=1' },
  { id: 'privacy', label: 'Privacy Policy', icon: 'fa-shield-alt', href: '/privacypolicy.html?app=1' },
  { id: 'host-pol', label: 'Host earning policies', icon: 'fa-star', href: '/host-policies.html?app=1' },
  { id: 'apply', label: 'Apply for Host / Agency / Seller', icon: 'fa-user-plus', href: '/role-apply.html?app=1' },
  { id: 'vip', label: 'VIP Privileges', icon: 'fa-crown', href: '/vip.html?app=1' },
  { id: 'privileges', label: 'Privileges', icon: 'fa-gem', href: '/privileges.html?app=1' },
  { id: 'verify', label: 'Live verification', icon: 'fa-id-card', href: '/live-verify.html?app=1' },
];

const TOGGLES: { key: keyof NotifSettings; label: string }[] = [
  { key: 'push_enabled', label: 'Push notifications' },
  { key: 'email_enabled', label: 'Email notifications' },
  { key: 'booking_updates', label: 'Booking updates' },
  { key: 'payment_updates', label: 'Payment updates' },
  { key: 'promotional_updates', label: 'Promotions' },
];

/**
 * Native Settings hub — notification toggles + legacy deep links.
 */
export function SettingsPage() {
  const go = useSpaNavigate();
  const qc = useQueryClient();
  const hasToken = Boolean(useAuthStore((s) => s.token) || localStorage.getItem('token'));

  const settingsQ = useQuery({
    queryKey: ['notif-settings'],
    queryFn: () => apiFetch<SettingsResponse>('/notifications/settings'),
    enabled: hasToken,
    staleTime: 60_000,
  });

  const saveM = useMutation({
    mutationFn: (patch: Partial<NotifSettings>) =>
      apiFetch<SettingsResponse>('/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-settings'] }),
  });

  const s = settingsQ.data?.data || {};

  return (
    <div className="ap-page ap-page-settings ap-native-hub">
      <header className="ap-hub-head">
        <button type="button" className="ap-icon-btn" onClick={() => go('/profile')} aria-label="Back">
          <i className="fas fa-arrow-left" />
        </button>
        <h1>Settings</h1>
      </header>

      <div className="ap-hub-scroll">
        {hasToken ? (
          <section className="ap-hub-section">
            <h2>Notifications</h2>
            {settingsQ.isLoading ? (
              <p className="ap-hub-hint">Loading…</p>
            ) : settingsQ.isError ? (
              <p className="ap-hub-hint">Couldn’t load notification settings.</p>
            ) : (
              TOGGLES.map((t) => (
                <label key={t.key} className="ap-toggle-row">
                  <span>{t.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(s[t.key])}
                    disabled={saveM.isPending}
                    onChange={(e) => saveM.mutate({ [t.key]: e.target.checked })}
                  />
                </label>
              ))
            )}
          </section>
        ) : null}

        <section className="ap-hub-section">
          <h2>More</h2>
          {LINKS.map((l) => (
            <button key={l.id} type="button" className="ap-menu-row" onClick={() => go(l.href)}>
              <i className={`fas ${l.icon}`} aria-hidden />
              <span>{l.label}</span>
              <i className="fas fa-chevron-right ap-chevron" aria-hidden />
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
