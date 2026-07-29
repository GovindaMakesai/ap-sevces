import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

/**
 * Temporary bridge for deep links not yet migrated
 * (/spa/legacy/live-room.html?channel=...).
 */
export function LegacyBridgePage() {
  const params = useParams();
  const location = useLocation();
  const rest = params['*'] || '';
  const src = useMemo(() => {
    const path = rest.startsWith('/') ? rest : `/${rest}`;
    const u = new URL(path, window.location.origin);
    /* Merge current search (router may put query on location.search) */
    const fromLoc = new URLSearchParams(location.search);
    fromLoc.forEach((v, k) => {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    });
    if (!u.searchParams.has('app')) u.searchParams.set('app', '1');
    u.searchParams.set('spa_embed', '1');
    return u.pathname + u.search;
  }, [rest, location.search]);

  return (
    <div className="ap-page ap-page-legacy">
      <iframe className="ap-legacy-frame" title="Legacy" src={src} />
    </div>
  );
}
