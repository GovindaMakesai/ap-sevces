import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isApSpaNavMessage, mapLegacyHrefToSpa } from './mapLegacyPath';

/**
 * Listens for postMessage from MPA iframes (spa_embed=1) and routes inside the shell.
 */
export function SpaNavBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isApSpaNavMessage(event.data)) return;

      if (event.data.type === 'back') {
        navigate(-1);
        return;
      }

      const href = event.data.href;
      if (!href) return;

      const mapped = mapLegacyHrefToSpa(href);
      if (!mapped) {
        /* External — top-level navigate */
        window.location.assign(href);
        return;
      }

      const replace = event.data.type === 'replace' || Boolean(event.data.replace);
      navigate(mapped.to, { replace });
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}
