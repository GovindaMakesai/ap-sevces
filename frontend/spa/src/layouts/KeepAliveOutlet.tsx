import { Outlet, useLocation } from 'react-router-dom';
import { useMemo, type ReactNode } from 'react';
import { ExplorePage } from '@/pages/ExplorePage';
import { VideoPage } from '@/pages/VideoPage';
import { ChatPage } from '@/pages/ChatPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RankingsPage } from '@/pages/RankingsPage';

const TAB_PATHS = ['/explore', '/video', '/chat', '/profile', '/rankings'] as const;

type TabPath = (typeof TAB_PATHS)[number];

/**
 * Keep primary tabs mounted (hidden) so scroll/data survive tab switches —
 * same UX pattern as Instagram / TikTok bottom tabs.
 */
export function KeepAliveOutlet() {
  const { pathname } = useLocation();
  const active = useMemo(() => {
    const hit = TAB_PATHS.find((p) => pathname === p || pathname.startsWith(`${p}/`));
    return (hit || '/explore') as TabPath;
  }, [pathname]);

  const isTab = TAB_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      <KeepAlivePane active={active === '/explore'}>
        <ExplorePage />
      </KeepAlivePane>
      <KeepAlivePane active={active === '/video'}>
        <VideoPage />
      </KeepAlivePane>
      <KeepAlivePane active={active === '/chat'}>
        <ChatPage />
      </KeepAlivePane>
      <KeepAlivePane active={active === '/profile'}>
        <ProfilePage />
      </KeepAlivePane>
      <KeepAlivePane active={active === '/rankings'}>
        <RankingsPage />
      </KeepAlivePane>
      {/* Non-tab child routes (if any) still render via Outlet */}
      {!isTab ? <Outlet /> : null}
    </>
  );
}

function KeepAlivePane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className="ap-keepalive-pane"
      hidden={!active}
      aria-hidden={!active}
      style={{ display: active ? 'block' : 'none' }}
    >
      {children}
    </div>
  );
}
