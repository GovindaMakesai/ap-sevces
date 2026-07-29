import { useLocation } from 'react-router-dom';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';

export function VideoPage() {
  const { pathname } = useLocation();
  const active = pathname === '/video' || pathname.startsWith('/video/');
  return (
    <div className="ap-page ap-page-video">
      <LegacyKeepAliveFrame src="/video.html" title="Video" active={active} />
    </div>
  );
}
