import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const IMMERSIVE = ['live-room.html', 'party-room.html'];

/**
 * Temporary bridge for deep links not yet migrated
 * (/spa/legacy/live-room.html?channel=...).
 * Shell back control for immersive rooms + store/agency pages.
 */
export function LegacyBridgePage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const rest = params['*'] || '';

  const { src, immersive, title } = useMemo(() => {
    const path = rest.startsWith('/') ? rest : `/${rest}`;
    const u = new URL(path, window.location.origin);
    const fromLoc = new URLSearchParams(location.search);
    fromLoc.forEach((v, k) => {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    });
    if (!u.searchParams.has('app')) u.searchParams.set('app', '1');
    u.searchParams.set('spa_embed', '1');
    const file = u.pathname.split('/').pop()?.toLowerCase() || '';
    return {
      src: u.pathname + u.search,
      immersive: IMMERSIVE.includes(file),
      title: file.replace('.html', '') || 'Page',
    };
  }, [rest, location.search]);

  return (
    <div className={`ap-page ap-page-legacy${immersive ? ' is-immersive' : ''}`}>
      {!immersive ? (
        <button
          type="button"
          className="ap-legacy-back"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate('/explore');
          }}
        >
          <i className="fas fa-arrow-left" /> Back
        </button>
      ) : (
        <button
          type="button"
          className="ap-legacy-back ap-legacy-back--float"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate('/explore');
          }}
          aria-label="Leave room"
        >
          <i className="fas fa-arrow-left" />
        </button>
      )}
      <div className="ap-legacy-frame-wrap">
        <iframe className="ap-legacy-frame" title={title} src={src} />
      </div>
    </div>
  );
}
