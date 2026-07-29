import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppShell() {
  return (
    <div className="ap-shell">
      <main className="ap-shell-main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
