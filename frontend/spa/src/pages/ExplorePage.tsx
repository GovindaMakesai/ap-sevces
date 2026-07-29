import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';
import { useLocation } from 'react-router-dom';

type RoomsResponse = {
  success?: boolean;
  data?: unknown[];
};

/**
 * Explore / Live — Phase 1 still embeds explore.html for full feature parity,
 * while the SPA shell owns navigation. Prefetches rooms into React Query cache
 * for the future native Explore page.
 */
export function ExplorePage() {
  const { pathname } = useLocation();
  const active = pathname === '/explore' || pathname.startsWith('/explore/');

  useQuery({
    queryKey: ['live-rooms', 'trending'],
    queryFn: () =>
      apiFetch<RoomsResponse>('/live/rooms?type=live&limit=12&sort=trending', {
        skipAuth: true,
      }),
    enabled: active,
    staleTime: 30_000,
  });

  return (
    <div className="ap-page ap-page-explore">
      <LegacyKeepAliveFrame src="/explore.html" title="Live" active={active} />
    </div>
  );
}
