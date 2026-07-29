import { useSpaNavigate } from '@/nav/useSpaNavigate';
import { useAuthStore } from '@/stores/authStore';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Login entry — embeds app-auth while keeping the SPA shell (no full MPA reboot).
 * After OAuth, login-success still writes tokens to localStorage; we hydrate and go Explore.
 */
export function LoginPage() {
  const go = useSpaNavigate();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const [params] = useSearchParams();

  useEffect(() => {
    if (!hydrated) return;
    if (token || localStorage.getItem('token')) {
      const redirect = params.get('redirect') || '/explore';
      go(redirect.startsWith('/') ? redirect : '/explore', { replace: true });
    }
  }, [hydrated, token, go, params]);

  /* Listen for auth completion from iframe (login-success may postMessage later) */
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'token' && e.newValue) {
        useAuthStore.getState().setSession(
          (() => {
            try {
              return JSON.parse(localStorage.getItem('user') || 'null');
            } catch {
              return null;
            }
          })(),
          e.newValue
        );
        go('/explore', { replace: true });
      }
    }
    window.addEventListener('storage', onStorage);
    const poll = window.setInterval(() => {
      const t = localStorage.getItem('token');
      if (t && t !== useAuthStore.getState().token) {
        try {
          const user = JSON.parse(localStorage.getItem('user') || 'null');
          useAuthStore.getState().setSession(user, t);
          go('/explore', { replace: true });
        } catch {
          /* ignore */
        }
      }
    }, 1500);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(poll);
    };
  }, [go]);

  const src = `/app-auth.html?app=1&spa_embed=1${params.get('redirect') ? `&redirect=${encodeURIComponent(params.get('redirect')!)}` : ''}`;

  return (
    <div className="ap-page ap-page-login">
      <iframe className="ap-legacy-frame" title="Sign in" src={src} />
    </div>
  );
}
