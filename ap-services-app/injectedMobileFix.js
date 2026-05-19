import { AP_EXPO_APP_ADMIN_CSS } from './apExpoAppAdminCss';
import { MOBILE_NAV_SHEET_JS, MOBILE_NAV_SHEET_CSS } from './mobileNavSheet';

/**
 * Injected into WebView so dashboard mobile layout works in the Expo app
 * even before Vercel deploy catches up with frontend/ changes.
 */
const MOBILE_DASHBOARD_CSS = `
html, body {
  overflow-x: hidden !important;
  max-width: 100% !important;
}
body.ap-dashboard-active {
  overflow-x: hidden !important;
  max-width: 100% !important;
}
.dashboard-page,
.dashboard-page .dashboard-container,
.dashboard-page > .container {
  overflow-x: hidden !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
.dashboard-grid {
  min-width: 0 !important;
  max-width: 100% !important;
}
.dashboard-grid > * {
  min-width: 0 !important;
  max-width: 100% !important;
}
.dashboard-main,
#dashboardMain {
  min-width: 0 !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  box-sizing: border-box !important;
}
.welcome-banner,
.welcome-content,
.welcome-text {
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
.welcome-text h1 {
  font-size: clamp(1.1rem, 4.5vw, 1.5rem) !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
.welcome-stats {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  width: 100% !important;
  gap: 6px !important;
}
@media (max-width: 1024px) {
  .dashboard-page .dashboard-grid {
    grid-template-columns: 1fr !important;
    width: 100% !important;
  }
  .dashboard-page .dashboard-sidebar {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    padding: 12px !important;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
  }
}
@media (max-width: 768px) {
  .dashboard-page .dashboard-sidebar .profile-summary,
  .dashboard-page .dashboard-sidebar .admin-profile {
    display: grid !important;
    grid-template-columns: 48px minmax(0, 1fr) !important;
    grid-template-rows: auto auto !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    text-align: left !important;
    overflow: hidden !important;
  }
  .dashboard-page .dashboard-sidebar .profile-avatar,
  .dashboard-page .dashboard-sidebar .admin-avatar {
    width: 48px !important;
    height: 48px !important;
    min-width: 48px !important;
    margin: 0 !important;
    grid-column: 1 !important;
    grid-row: 1 / span 2 !important;
  }
  .dashboard-page .dashboard-sidebar .profile-name,
  .dashboard-page .dashboard-sidebar .admin-name {
    grid-column: 2 !important;
    grid-row: 1 !important;
    min-width: 0 !important;
    overflow-wrap: anywhere !important;
    font-size: 0.95rem !important;
  }
  .dashboard-page .dashboard-sidebar .admin-role,
  .dashboard-page .dashboard-sidebar .profile-rating {
    grid-column: 2 !important;
    grid-row: 2 !important;
    min-width: 0 !important;
  }
  .dashboard-page .dashboard-sidebar .profile-email,
  .dashboard-page .dashboard-sidebar .profile-phone,
  .dashboard-page .dashboard-sidebar .admin-email,
  .dashboard-page .dashboard-sidebar .profile-stats {
    display: none !important;
  }
  html.ap-expo-app .dashboard-sidebar--mobile .sidebar-nav {
    display: none !important;
    flex-direction: column !important;
    overflow-x: hidden !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    max-height: min(55vh, 420px) !important;
    overflow-y: auto !important;
  }
  html.ap-expo-app .dashboard-sidebar--mobile .sidebar-nav.is-open {
    display: flex !important;
  }
  html.ap-expo-app .dashboard-sidebar--mobile .sidebar-nav .nav-item {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .dashboard-page .dashboard-sidebar .nav-item {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    box-sizing: border-box !important;
    flex-wrap: wrap !important;
  }
  .dashboard-page .dashboard-sidebar .sidebar-footer {
    display: none !important;
  }
  .dashboard-page .dashboard-nav-toggle {
    display: flex !important;
    width: 100% !important;
    max-width: 100% !important;
  }
  .dashboard-page .booking-card,
  .dashboard-page .bookings-list,
  .dashboard-page .dashboard-section {
    max-width: 100% !important;
    min-width: 0 !important;
    overflow-x: hidden !important;
  }
  .dashboard-page .booking-details {
    grid-template-columns: 1fr !important;
  }
  .dashboard-page .booking-actions {
    flex-direction: column !important;
  }
  .dashboard-page .booking-actions .action-btn {
    width: 100% !important;
  }
  .dashboard-page .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .dashboard-page .table-container {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: auto !important;
  }
  .dashboard-page .filter-bar,
  .dashboard-page .search-box,
  .dashboard-page .filter-select,
  .dashboard-page .header-actions,
  .dashboard-page .header-actions > * {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }
  .dashboard-page .section-header {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .dashboard-page .weekday-row {
    flex-direction: column !important;
    align-items: stretch !important;
  }
}
@media (max-width: 480px) {
  .dashboard-page .stats-grid {
    grid-template-columns: 1fr !important;
  }
}
@media (max-width: 768px) {
  .navbar { z-index: 1100 !important; }
  .navbar .nav-content { position: relative !important; }
  .navbar .nav-content > .nav-links:not(.show) { display: none !important; }
  .navbar .nav-content > .nav-links.show {
    display: flex !important;
    flex-direction: column !important;
    position: absolute !important;
    top: 100% !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    background: #fff !important;
    z-index: 1101 !important;
    padding: 1rem !important;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1) !important;
  }
  .navbar .mobile-menu-btn {
    display: flex !important;
    min-width: 44px !important;
    min-height: 44px !important;
    z-index: 1102 !important;
  }
  .login-btn,
  .nav-btn.next,
  .nav-btn.submit {
    background: #2563eb !important;
    color: #ffffff !important;
    width: 100% !important;
    min-height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .login-btn i,
  .nav-btn.next i,
  .nav-btn.submit i {
    color: #ffffff !important;
  }
  .user-type-btn.active {
    color: #2563eb !important;
    background: #fff !important;
  }
  .services-grid { grid-template-columns: 1fr !important; }
  .service-card { max-width: 100% !important; }
}
`;

export function getMobileDashboardInjectScript() {
  const cssJson = JSON.stringify(
    MOBILE_DASHBOARD_CSS + AP_EXPO_APP_ADMIN_CSS + MOBILE_NAV_SHEET_CSS
  );
  return `
${MOBILE_NAV_SHEET_JS}
(function() {
  if (window.__apExpoInjectBootstrapped) {
    if (typeof window.__apExpoRunInject === 'function') window.__apExpoRunInject();
    return true;
  }
  window.__apExpoInjectBootstrapped = true;

  window.__apExpoRunInject = function() {
    if (!document.body) return;
    try {
      if (typeof apCloseNavSheet === 'function') apCloseNavSheet();
      document.documentElement.classList.add('ap-expo-app');
      document.body.classList.add('ap-expo-app');
      var css = ${cssJson};
      var style = document.getElementById('ap-app-mobile-dashboard-fix');
      if (!style) {
        style = document.createElement('style');
        style.id = 'ap-app-mobile-dashboard-fix';
        (document.head || document.documentElement).appendChild(style);
      }
      if (style.textContent !== css) style.textContent = css;
      if (document.querySelector('.dashboard-page')) {
        document.body.classList.add('ap-dashboard-active');
      } else {
        document.body.classList.remove('ap-dashboard-active');
      }
      var vp = document.querySelector('meta[name="viewport"]');
      if (vp) {
        vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
      } else {
        vp = document.createElement('meta');
        vp.name = 'viewport';
        vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
        (document.head || document.documentElement).appendChild(vp);
      }
      apBindMobileNavSheet();
      apFixDashboardSidebar();
      if (window.UI && typeof UI.enhanceDashboardSidebar === 'function') {
        try { UI.enhanceDashboardSidebar(); } catch (e) {}
      }
    } catch (err) {
      console.warn('[ap-expo] inject failed', err);
    }
  };

  var injectTimer = null;
  function scheduleInject() {
    if (injectTimer) clearTimeout(injectTimer);
    injectTimer = setTimeout(function() {
      injectTimer = null;
      window.__apExpoRunInject();
    }, 120);
  }

  scheduleInject();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInject, { once: true });
  }
  window.addEventListener('load', scheduleInject, { once: true });

  if (!window.__apExpoNavObserver) {
    window.__apExpoNavObserver = true;
    try {
      var obs = new MutationObserver(function(mutations) {
        var needsNav = false;
        for (var i = 0; i < mutations.length; i++) {
          var nodes = mutations[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            var n = nodes[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && (n.matches('.navbar') || n.matches('.mobile-menu-btn') || n.matches('.dashboard-sidebar'))) {
              needsNav = true;
              break;
            }
            if (n.querySelector && (n.querySelector('.navbar') || n.querySelector('.mobile-menu-btn') || n.querySelector('.dashboard-sidebar'))) {
              needsNav = true;
              break;
            }
          }
          if (needsNav) break;
        }
        if (needsNav) scheduleInject();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }
})();
true;
`;
}
