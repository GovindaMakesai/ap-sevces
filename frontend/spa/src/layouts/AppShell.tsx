import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';

function hideBottomNav(pathname: string, search: string): boolean {
  const p = pathname.toLowerCase();
  const q = new URLSearchParams(search);
  if (p === '/chat' || p.startsWith('/chat/')) {
    if (q.get('conversation') || q.get('id') || q.get('worker')) return true;
  }
  if (p === '/video' || p.startsWith('/video/')) {
    if (q.get('fullscreen') || q.get('post') || q.get('topic')) return true;
  }
  return (
    p.includes('/legacy/live-room') ||
    p.includes('/legacy/party-room') ||
    p.includes('/legacy/video.html') ||
    p === '/login' ||
    p.startsWith('/login/')
  );
}

export function AppShell() {
  const { pathname, search } = useLocation();
  const hideNav = hideBottomNav(pathname, search);

  return (
    <div className={`ap-shell${hideNav ? ' ap-shell--immersive' : ''}`}>
      <main className="ap-shell-main">
        <Outlet />
      </main>
      {hideNav ? null : <BottomNav />}
    </div>
  );
}
