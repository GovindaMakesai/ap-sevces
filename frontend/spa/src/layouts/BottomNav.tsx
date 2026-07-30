import { NavLink } from 'react-router-dom';
import { useUiStore } from '@/stores/uiStore';

/**
 * Production bottom nav (social-shell.js BOTTOM_NAV) — icons only, cream/gold planet.
 * Video | Rankings | Explore(center) | Chat | Profile
 */
export function BottomNav() {
  const unread = useUiStore((s) => s.chatUnread);

  return (
    <nav className="social-bottom-nav ap-shell-bottom-nav" aria-label="Main">
      <NavLink
        to="/video"
        className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
        data-nav="video"
        aria-label="Video"
      >
        <i className="fas fa-video" aria-hidden />
      </NavLink>

      <NavLink
        to="/rankings"
        className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
        data-nav="rankings"
        aria-label="Rankings"
      >
        <i className="fas fa-trophy" aria-hidden />
      </NavLink>

      <NavLink
        to="/explore"
        className={({ isActive }) => `nav-item nav-center${isActive ? ' is-active' : ''}`}
        data-nav="explore"
        aria-label="Explore"
      >
        <span className="nav-planet" aria-hidden="true">
          <span className="nav-planet-glow" />
          <span className="nav-planet-body" />
          <span className="nav-planet-ring" />
        </span>
      </NavLink>

      <NavLink
        to="/chat"
        className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
        data-nav="chat"
        aria-label="Chat"
      >
        <i className="fas fa-comment-dots" aria-hidden />
        {unread > 0 ? (
          <span className="nav-badge">{unread > 9 ? '9+' : unread}</span>
        ) : null}
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
        data-nav="profile"
        aria-label="Profile"
      >
        <i className="fas fa-user" aria-hidden />
      </NavLink>
    </nav>
  );
}
