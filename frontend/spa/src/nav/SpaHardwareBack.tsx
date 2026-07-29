import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Registers window.__AP_SPA_HARDWARE_BACK for native App.js inject.
 * Handles /spa home, legacy live iframes, and history.back for other routes.
 * Does not change the WebView entry URL.
 */
export function SpaHardwareBack() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function isSpaHome(pathname: string) {
      const p = pathname.replace(/\/+$/, '') || '/';
      return p === '/explore' || p === '/' || p === '';
    }

    function isLegacyLive(pathname: string) {
      const p = pathname.toLowerCase();
      return p.includes('/legacy/live-room') || p.includes('/legacy/party-room');
    }

    function handler() {
      try {
        const path = location.pathname || '';
        if (isLegacyLive(path)) {
          const frame = document.querySelector(
            'iframe.ap-legacy-frame, .ap-legacy-frame-wrap iframe'
          ) as HTMLIFrameElement | null;
          if (frame?.contentWindow) {
            frame.contentWindow.postMessage(
              { source: 'ap-spa-shell', type: 'hardware_back' },
              window.location.origin
            );
          }
          /* Parent also leaves the legacy route so shell returns to Explore */
          window.setTimeout(() => navigate('/explore', { replace: true }), 120);
          return true;
        }

        if (path === '/chat' || path.startsWith('/chat')) {
          const q = new URLSearchParams(location.search);
          if (q.get('conversation') || q.get('id') || q.get('worker')) {
            navigate('/chat', { replace: true });
            return true;
          }
        }

        if (path === '/video' || path.startsWith('/video')) {
          const q = new URLSearchParams(location.search);
          if (q.get('fullscreen') || q.get('post') || q.get('topic')) {
            navigate('/video', { replace: true });
            return true;
          }
        }

        if (isSpaHome(path)) {
          return false; /* let native double-press exit */
        }

        if (window.history.length > 1) {
          navigate(-1);
          return true;
        }
        navigate('/explore', { replace: true });
        return true;
      } catch {
        navigate('/explore', { replace: true });
        return true;
      }
    }

    (window as unknown as { __AP_SPA_HARDWARE_BACK?: () => boolean }).__AP_SPA_HARDWARE_BACK =
      handler;
    return () => {
      try {
        delete (window as unknown as { __AP_SPA_HARDWARE_BACK?: () => boolean })
          .__AP_SPA_HARDWARE_BACK;
      } catch {
        /* ignore */
      }
    };
  }, [navigate, location.pathname, location.search]);

  return null;
}
