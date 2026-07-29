import { useLocation } from 'react-router-dom';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';

export function RankingsPage() {
  const { pathname } = useLocation();
  const active = pathname === '/rankings' || pathname.startsWith('/rankings/');
  return (
    <div className="ap-page ap-page-rankings">
      <LegacyKeepAliveFrame src="/rankings.html" title="Rankings" active={active} />
    </div>
  );
}
