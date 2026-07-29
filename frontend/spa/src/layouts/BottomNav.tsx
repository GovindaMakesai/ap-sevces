import { NavLink } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';

type Tab =
  | { to: string; id: string; label: string; icon: string; badge?: boolean }
  | { to: string; id: string; label: string; icon: 'planet'; center: true };

const TABS: Tab[] = [
  { to: '/explore', id: 'explore', label: 'Live', icon: 'fa-house' },
  { to: '/video', id: 'video', label: 'Video', icon: 'fa-clapperboard' },
  { to: '/explore', id: 'planet', label: '', icon: 'planet', center: true },
  { to: '/chat', id: 'chat', label: 'Chat', icon: 'fa-comment', badge: true },
  { to: '/profile', id: 'profile', label: 'Me', icon: 'fa-user' },
];

/**
 * Client-side tab bar — never uses location.href / full reloads.
 */
export function BottomNav() {
  const unread = useUiStore((s) => s.chatUnread);

  return (
    <nav className="ap-bottom-nav" aria-label="Main">
      {TABS.map((tab) => {
        if ('center' in tab && tab.center) {
          return (
            <NavLink
              key={tab.id}
              to="/explore"
              className={({ isActive }) =>
                `ap-nav-item ap-nav-center${isActive ? ' is-active' : ''}`
              }
              aria-label="Live"
            >
              <span className="ap-nav-planet" aria-hidden>
                <span className="ap-nav-planet-glow" />
                <span className="ap-nav-planet-body" />
              </span>
            </NavLink>
          );
        }
        return (
          <NavLink
            key={tab.id}
            to={tab.to}
            className={({ isActive }) => `ap-nav-item${isActive ? ' is-active' : ''}`}
          >
            <i className={`fas ${tab.icon}`} aria-hidden />
            {'badge' in tab && tab.badge && unread > 0 ? (
              <span className="ap-nav-badge">{unread > 9 ? '9+' : unread}</span>
            ) : null}
            <span className="ap-nav-label">{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
