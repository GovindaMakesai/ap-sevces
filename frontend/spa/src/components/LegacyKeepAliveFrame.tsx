import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  /** Legacy HTML path relative to site root, e.g. /explore.html */
  src: string;
  title: string;
  /** When false, iframe stays mounted but hidden by parent keep-alive. */
  active: boolean;
};

/**
 * Phase-1 bridge: embed existing MPA screens inside the SPA shell.
 * Iframe loads once on first activation; later tab switches only hide/show.
 */
export function LegacyKeepAliveFrame({ src, title, active }: Props) {
  const [mounted, setMounted] = useState(active);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const url = useMemo(() => {
    const u = new URL(src, window.location.origin);
    if (!u.searchParams.has('app')) u.searchParams.set('app', '1');
    u.searchParams.set('spa_embed', '1');
    return u.pathname + u.search;
  }, [src]);

  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);

  if (!mounted) {
    return <div className="ap-legacy-placeholder" aria-hidden />;
  }

  return (
    <iframe
      ref={frameRef}
      className="ap-legacy-frame"
      title={title}
      src={url}
    />
  );
}
