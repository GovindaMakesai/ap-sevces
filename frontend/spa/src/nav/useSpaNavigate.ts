import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { mapLegacyHrefToSpa } from '@/nav/mapLegacyPath';

/** Navigate inside the SPA shell; maps legacy HTML hrefs automatically. */
export function useSpaNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (href: string, opts?: { replace?: boolean }) => {
      const mapped = mapLegacyHrefToSpa(href);
      if (!mapped) {
        window.location.assign(href);
        return;
      }
      navigate(mapped.to, { replace: opts?.replace });
    },
    [navigate]
  );
}
