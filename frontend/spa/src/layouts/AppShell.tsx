import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';

function hideBottomNav(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    p.includes('/legacy/live-room') ||
    p.includes('/legacy/party-room') ||
    p === '/login' ||
    p.startsWith('/login/')
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const hideNav = hideBottomNav(pathname);

  return (
    <div className={`ap-shell${hideNav ? ' ap-shell--immersive' : ''}`}>
      <main className="ap-shell-main">
        <Outlet />
      </main>
      {hideNav ? null : <BottomNav />}
    </div>
  );
}
