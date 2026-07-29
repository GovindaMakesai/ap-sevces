import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Temporary bridge for deep links not yet migrated
 * (/spa/legacy/live-room.html?channel=...).
 */
export function LegacyBridgePage() {
  const params = useParams();
  const rest = params['*'] || '';
  const src = useMemo(() => {
    const path = rest.startsWith('/') ? rest : `/${rest}`;
    const u = new URL(path, window.location.origin);
    if (!u.searchParams.has('app')) u.searchParams.set('app', '1');
    return u.pathname + u.search;
  }, [rest]);

  return (
    <div className="ap-page ap-page-legacy">
      <iframe className="ap-legacy-frame" title="Legacy" src={src} />
    </div>
  );
}
