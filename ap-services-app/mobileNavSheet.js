/** Injected JS string: reliable hamburger menu for Expo WebView (no Vercel CSS dependency) */
export const MOBILE_NAV_SHEET_JS = `
function apCloseNavSheet() {
  var sheet = document.getElementById('ap-mobile-nav-sheet');
  if (sheet) sheet.remove();
  document.body.classList.remove('ap-nav-sheet-open');
  document.querySelectorAll('.mobile-menu-btn').forEach(function (btn) {
    var icon = btn.querySelector('i');
    btn.setAttribute('aria-expanded', 'false');
    if (icon) {
      icon.classList.add('fa-bars');
      icon.classList.remove('fa-times');
    }
  });
}

function apGetUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (e) {
    return null;
  }
}

function apBuildTopLinks() {
  var user = apGetUser();
  var links = [];
  if (!user || !user.role) {
    links.push(
      { href: '/services.html', label: 'Services' },
      { href: '/register.html', label: 'Become a Pro' },
      { href: '/help.html', label: 'Help' },
      { href: '/login.html', label: 'Login' },
      { href: '/register.html', label: 'Sign Up' }
    );
    return links;
  }
  links.push({ href: '/services.html', label: 'Services' });
  if (user.role === 'admin') {
    links.push({ href: '/admin-dashboard.html', label: 'Admin Dashboard' });
    links.push({ href: '/customer-dashboard.html', label: 'My Bookings' });
  } else if (user.role === 'worker') {
    links.push({ href: '/customer-dashboard.html', label: 'My Bookings' });
    links.push({ href: '/worker-dashboard.html', label: 'Pro Dashboard' });
  } else {
    links.push({ href: '/customer-dashboard.html', label: 'My Bookings' });
    links.push({ href: '/become-a-pro.html', label: 'Become a Pro' });
  }
  links.push({ href: '/help.html', label: 'Help' });
  links.push({ href: '#logout', label: 'Logout', logout: true });
  return links;
}

function apOpenNavSheet(btn) {
  apCloseNavSheet();
  if (window.UI && typeof UI.updateNavbar === 'function') {
    try { UI.updateNavbar(); } catch (e) {}
  }

  var sheet = document.createElement("motion");
  sheet.id = 'ap-mobile-nav-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML =
    '<motion class="ap-nav-sheet-backdrop" data-ap-close="1"></motion>' +
    '<motion class="ap-nav-sheet-panel"></motion>';

  var panel = sheet.querySelector('.ap-nav-sheet-panel');
  var links = apBuildTopLinks();
  links.forEach(function (item) {
    if (item.logout) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-nav-sheet-link ap-nav-sheet-logout';
      b.textContent = item.label;
      b.addEventListener('click', function () {
        apCloseNavSheet();
        if (window.Auth && typeof Auth.logout === 'function') Auth.logout();
        else window.location.href = '/login.html';
      });
      panel.appendChild(b);
      return;
    }
    var a = document.createElement('a');
    a.className = 'ap-nav-sheet-link';
    a.href = item.href;
    a.textContent = item.label;
    a.addEventListener('click', function () { apCloseNavSheet(); });
    panel.appendChild(a);
  });

  var sidebarNav = document.querySelector('.dashboard-sidebar .sidebar-nav');
  if (sidebarNav) {
    var heading = document.createElement('p');
    heading.className = 'ap-nav-sheet-heading';
    heading.textContent = 'Dashboard sections';
    panel.appendChild(heading);
    sidebarNav.querySelectorAll('.nav-item').forEach(function (item) {
      var clone = item.cloneNode(true);
      clone.className = 'ap-nav-sheet-link ap-nav-sheet-dash-item';
      clone.addEventListener('click', function () {
        apCloseNavSheet();
        item.click();
      });
      panel.appendChild(clone);
    });
  }

  sheet.querySelector('[data-ap-close]').addEventListener('click', apCloseNavSheet);
  document.body.appendChild(sheet);
  document.body.classList.add('ap-nav-sheet-open');

  if (btn) {
    btn.setAttribute('aria-expanded', 'true');
    var icon = btn.querySelector('i');
    if (icon) {
      icon.classList.remove('fa-bars');
      icon.classList.add('fa-times');
    }
  }
}

function apToggleNavSheet(btn) {
  if (document.getElementById('ap-mobile-nav-sheet')) {
    apCloseNavSheet();
    return;
  }
  apOpenNavSheet(btn);
}

function apBindMobileNavSheet() {
  document.querySelectorAll('.navbar .mobile-menu-btn').forEach(function (btn) {
    if (btn.dataset.apSheetBound === '1') return;
    btn.dataset.apSheetBound = '1';
    btn.setAttribute('type', 'button');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      apToggleNavSheet(btn);
    }, true);
  });
}

function apFixDashboardSidebar() {
  var sidebar = document.querySelector('.dashboard-sidebar');
  var nav = sidebar && sidebar.querySelector('.sidebar-nav');
  if (!sidebar || !nav) return;
  sidebar.classList.add('dashboard-sidebar--mobile');
  nav.classList.add('is-open');
  nav.style.display = 'flex';
  nav.style.flexDirection = 'column';
  var toggle = sidebar.querySelector('.dashboard-nav-toggle');
  if (toggle) toggle.style.display = 'none';
}
`;

export const MOBILE_NAV_SHEET_CSS = `
#ap-mobile-nav-sheet {
  position: fixed !important;
  inset: 0 !important;
  z-index: 999999 !important;
  pointer-events: auto !important;
}
#ap-mobile-nav-sheet .ap-nav-sheet-backdrop {
  position: absolute !important;
  inset: 0 !important;
  background: rgba(0,0,0,0.45) !important;
}
#ap-mobile-nav-sheet .ap-nav-sheet-panel {
  position: absolute !important;
  top: 72px !important;
  left: 8px !important;
  right: 8px !important;
  max-height: min(78vh, 560px) !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  background: #ffffff !important;
  border-radius: 12px !important;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2) !important;
  padding: 8px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
}
.ap-nav-sheet-link,
.ap-nav-sheet-dash-item {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  width: 100% !important;
  min-height: 48px !important;
  padding: 12px 14px !important;
  margin: 0 !important;
  border: none !important;
  border-bottom: 1px solid #e5e7eb !important;
  background: #fff !important;
  color: #111827 !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  text-align: left !important;
  text-decoration: none !important;
  box-sizing: border-box !important;
  cursor: pointer !important;
  -webkit-tap-highlight-color: transparent;
}
.ap-nav-sheet-heading {
  margin: 8px 14px 4px !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  color: #6b7280 !important;
}
.ap-nav-sheet-logout {
  color: #dc2626 !important;
  justify-content: center !important;
}
html.ap-expo-app .dashboard-nav-toggle {
  display: none !important;
}
html.ap-expo-app .dashboard-sidebar .sidebar-nav {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  gap: 4px !important;
  overflow: visible !important;
}
html.ap-expo-app .dashboard-sidebar .sidebar-nav .nav-item {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  width: 100% !important;
  color: #374151 !important;
}
html.ap-expo-app .navbar .nav-content > .nav-links {
  display: none !important;
}
body.ap-nav-sheet-open {
  overflow: hidden !important;
}
`;

