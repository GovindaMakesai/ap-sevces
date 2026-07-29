import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';
import { useAuthStore } from '@/stores/authStore';

type MeResponse = { success?: boolean; data?: { user?: Record<string, unknown> } };

export function ProfilePage() {
  const { pathname } = useLocation();
  const active = pathname === '/profile' || pathname.startsWith('/profile/');
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);

  useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await apiFetch<MeResponse>('/auth/me');
      const user = res?.data?.user;
      if (user && typeof user === 'object' && 'id' in user) {
        setSession(user as never, token);
      }
      return res;
    },
    enabled: active && Boolean(token || localStorage.getItem('token')),
    staleTime: 120_000,
  });

  return (
    <div className="ap-page ap-page-profile">
      <LegacyKeepAliveFrame src="/profile-tab.html" title="Profile" active={active} />
    </div>
  );
}
