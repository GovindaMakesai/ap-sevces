/**
 * Map legacy MPA paths onto SPA client routes.
 * Tab pages become in-shell routes; everything else goes through /legacy/*.
 */

const TAB_MAP: Record<string, string> = {
  '/explore.html': '/explore',
  '/video.html': '/video',
  '/chat.html': '/chat',
  '/profile-tab.html': '/profile',
  '/profile.html': '/profile',
  '/rankings.html': '/rankings',
  '/app-auth.html': '/login',
  '/login.html': '/login',
  '/search.html': '/search',
  '/settings.html': '/settings',
};

export type SpaNavTarget = {
  /** Path for react-router (basename /spa already applied by navigate()) */
  to: string;
  /** If true, use navigate(to, { replace: true }) */
  replace?: boolean;
};

/**
 * Convert an absolute or root-relative MPA href into an SPA location.
 * Examples:
 *   /explore.html?app=1           → /explore
 *   /live-room.html?channel=x     → /legacy/live-room.html?channel=x&app=1
 *   /chat.html?_cb=1              → /chat
 */
export function mapLegacyHrefToSpa(href: string): SpaNavTarget | null {
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://local');
  } catch {
    return null;
  }

  /* External absolute URLs — leave alone (caller should full-navigate) */
  if (typeof window !== 'undefined' && url.origin !== window.location.origin) {
    return null;
  }

  const pathname = url.pathname;
  const tab = TAB_MAP[pathname];
  if (tab) {
    /* Preserve useful query keys for tabs (e.g. chat deep links later) */
    const keep = new URLSearchParams();
    url.searchParams.forEach((v, k) => {
      if (k === 'app' || k === 'spa_embed' || k === '_cb' || k === 'source') return;
      keep.set(k, v);
    });
    const qs = keep.toString();
    return { to: qs ? `${tab}?${qs}` : tab };
  }

  /* Already under /spa — strip basename for router */
  if (pathname.startsWith('/spa/') || pathname === '/spa') {
    const rest = pathname.slice('/spa'.length) || '/';
    return { to: rest + url.search };
  }

  /* Native shell routes (no .html) */
  const SHELL = [
    '/search',
    '/settings',
    '/centers',
    '/explore',
    '/video',
    '/chat',
    '/profile',
    '/rankings',
    '/login',
  ];
  if (SHELL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return { to: pathname + url.search };
  }

  /* Legacy bridge: keep path + query */
  if (!url.searchParams.has('app')) url.searchParams.set('app', '1');
  const legacyPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return { to: `/legacy/${legacyPath}${url.search}` };
}

export function isApSpaNavMessage(data: unknown): data is {
  source: 'ap-spa-embed';
  type: 'navigate' | 'replace' | 'back';
  href?: string;
  replace?: boolean;
} {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.source === 'ap-spa-embed' && typeof d.type === 'string';
}
