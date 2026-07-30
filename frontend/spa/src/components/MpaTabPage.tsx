import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { LegacyKeepAliveFrame } from '@/components/LegacyKeepAliveFrame';

type Props = {
  /** Production HTML path, e.g. /explore.html */
  htmlPath: string;
  /** SPA route prefix that owns this tab, e.g. /explore */
  routePrefix: string;
  title: string;
  /** Remount iframe when SPA search changes (chat thread, video deep link). */
  remountOnSearch?: boolean;
};

/**
 * Keep-alive embed of a production MPA screen inside the SPA shell.
 * Visual parity = real explore/video/chat/profile/rankings HTML.
 */
export function MpaTabPage({ htmlPath, routePrefix, title, remountOnSearch = false }: Props) {
  const { pathname, search } = useLocation();
  const active = pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);

  const src = useMemo(() => {
    const u = new URL(htmlPath, window.location.origin);
    const fromSpa = new URLSearchParams(search);
    fromSpa.forEach((v, k) => {
      if (k === 'app' || k === 'spa_embed') return;
      u.searchParams.set(k, v);
    });
    return u.pathname + u.search;
  }, [htmlPath, search]);

  return (
    <div className="ap-page ap-page-mpa">
      <LegacyKeepAliveFrame
        src={src}
        title={title}
        active={active}
        remountOnSrcChange={remountOnSearch}
      />
    </div>
  );
}
