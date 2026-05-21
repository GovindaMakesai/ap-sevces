// frontend/app.js
// AP Services Frontend - Complete Working Version with FormData Support

// ==================== CONFIGURATION ====================
const LIVE_FRONTEND_URL = 'https://ap-sevces.vercel.app';
const LIVE_API_URL = 'https://ap-sevces.onrender.com/api';
const LOCAL_API_URL = 'http://localhost:5000/api';
const LOCAL_FRONTEND_URL = 'http://localhost:5500';

const IS_CAPACITOR = Boolean(window.Capacitor?.isNativePlatform?.());
const IS_EXPO_WEBVIEW = Boolean(window.ReactNativeWebView);
const IS_LOCAL = !IS_CAPACITOR && !IS_EXPO_WEBVIEW && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function isNativeAppContext() {
    if (window.__AP_NATIVE_APP__) return true;
    if (IS_EXPO_WEBVIEW || IS_CAPACITOR) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
}

const CONFIG = {
    API_URL: IS_LOCAL ? LOCAL_API_URL : LIVE_API_URL,
    FRONTEND_URL: IS_LOCAL ? LOCAL_FRONTEND_URL : LIVE_FRONTEND_URL
};
CONFIG.BACKEND_URL = CONFIG.API_URL.replace(/\/api\/?$/, '');

console.log('🚀 App.js loaded');
console.log('📡 API URL:', CONFIG.API_URL);

// ==================== STATE MANAGEMENT ====================
const AppState = {
    user: null,
    token: localStorage.getItem('token'),
    currentLocation: null,
    selectedCity: localStorage.getItem('selectedCity') || 'Mumbai'
};

// ==================== API SERVICE WITH FORMDATA SUPPORT ====================
const API = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_URL}${endpoint}`;
        console.log(`📡 API Request: ${options.method || 'GET'} ${url}`);
        
        // Prepare headers
        const headers = { ...options.headers };
        
        // Add authorization token if available
        if (AppState.token) {
            headers['Authorization'] = `Bearer ${AppState.token}`;
        }
        
        // Don't set Content-Type for FormData - browser will set it with boundary
        const isFormData = options.body instanceof FormData;
        if (!isFormData && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        
        // Prepare body
        let body = options.body;
        if (!isFormData && body && typeof body === 'object') {
            body = JSON.stringify(body);
        }
        
        try {
            const response = await fetch(url, {
                ...options,
                headers,
                body,
                mode: 'cors',
                credentials: 'include'
            });
            
            // Try to parse JSON response
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            if (!response.ok) {
                console.error('❌ API Error Response:', data);
                if (typeof data === 'object' && data !== null) {
                    if (Array.isArray(data.errors) && data.errors.length) {
                        const first = data.errors[0];
                        const msg = first.msg || first.message || 'Validation failed';
                        const err = new Error(msg);
                        err.status = response.status;
                        throw err;
                    }
                    if (data.message) {
                        const err = new Error(data.message);
                        err.status = response.status;
                        throw err;
                    }
                }
                const err = new Error(typeof data === 'string' ? data : `HTTP error ${response.status}`);
                err.status = response.status;
                throw err;
            }
            
            console.log('✅ API Success:', data);
            return data;
        } catch (error) {
            console.error('❌ API Request Failed:', error);
            throw error;
        }
    },
    
    get(endpoint) { 
        return this.request(endpoint, { method: 'GET' }); 
    },
    
    post(endpoint, body) { 
        return this.request(endpoint, { 
            method: 'POST', 
            body: body 
        }); 
    },
    
    put(endpoint, body) { 
        return this.request(endpoint, { 
            method: 'PUT', 
            body: body 
        }); 
    },
    
    delete(endpoint) { 
        return this.request(endpoint, { method: 'DELETE' }); 
    },
    
    // Special method for file uploads
    upload(endpoint, formData, method = 'POST') {
        return this.request(endpoint, {
            method: method,
            body: formData
            // Don't set Content-Type - browser will set it with boundary
        });
    }
};

// ==================== SERVICES API ====================
const ServicesAPI = {
    async getAll(category = null, search = null) {
        try {
            let url = '/services';
            const params = new URLSearchParams();
            
            if (category) params.append('category', category);
            if (search) params.append('search', search);
            
            if (params.toString()) {
                url += '?' + params.toString();
            }
            
            console.log('🔍 Fetching services:', url);
            const response = await API.get(url);
            return response;
        } catch (error) {
            console.error('❌ ServicesAPI.getAll error:', error);
            throw error;
        }
    },
    
    async getById(id) {
        try {
            const response = await API.get(`/services/${id}`);
            return response;
        } catch (error) {
            console.error('❌ ServicesAPI.getById error:', error);
            throw error;
        }
    },
    
    async getPopular(limit = 6) {
        try {
            const response = await API.get(`/services/popular?limit=${limit}`);
            return response;
        } catch (error) {
            console.error('❌ ServicesAPI.getPopular error:', error);
            throw error;
        }
    }
};

// ==================== ADMIN SERVICES API (with image upload) ====================
const AdminAPI = {
    // Get all services for admin
    async getServices() {
        try {
            const response = await API.get('/admin/services');
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.getServices error:', error);
            throw error;
        }
    },
    
    // Create service with image upload
    async createService(formData) {
        try {
            const response = await API.upload('/admin/services', formData, 'POST');
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.createService error:', error);
            throw error;
        }
    },
    
    // Update service with image upload
    async updateService(serviceId, formData) {
        try {
            const response = await API.upload(`/admin/services/${serviceId}`, formData, 'PUT');
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.updateService error:', error);
            throw error;
        }
    },
    
    // Delete service
    async deleteService(serviceId) {
        try {
            const response = await API.delete(`/admin/services/${serviceId}`);
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.deleteService error:', error);
            throw error;
        }
    },
    
    // Get dashboard stats
    async getDashboardStats() {
        try {
            const response = await API.get('/admin/dashboard/stats');
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.getDashboardStats error:', error);
            throw error;
        }
    },
    
    // Get all users
    async getUsers(params = {}) {
        try {
            const queryString = new URLSearchParams(params).toString();
            const url = queryString ? `/admin/users?${queryString}` : '/admin/users';
            const response = await API.get(url);
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.getUsers error:', error);
            throw error;
        }
    },
    
    // Get all workers
    async getWorkers(params = {}) {
        try {
            const queryString = new URLSearchParams(params).toString();
            const url = queryString ? `/admin/workers?${queryString}` : '/admin/workers';
            const response = await API.get(url);
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.getWorkers error:', error);
            throw error;
        }
    },
    
    // Approve worker
    async approveWorker(workerId, status) {
        try {
            const response = await API.put(`/admin/workers/${workerId}/approve`, { status });
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.approveWorker error:', error);
            throw error;
        }
    },
    
    // Get all bookings
    async getBookings(params = {}) {
        try {
            const queryString = new URLSearchParams(params).toString();
            const url = queryString ? `/admin/bookings?${queryString}` : '/admin/bookings';
            const response = await API.get(url);
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.getBookings error:', error);
            throw error;
        }
    },
    
    // Get analytics
    async getAnalytics(period = 'month') {
        try {
            const response = await API.get(`/admin/analytics?period=${period}`);
            return response;
        } catch (error) {
            console.error('❌ AdminAPI.getAnalytics error:', error);
            throw error;
        }
    }
};

// ==================== AUTH SERVICE ====================
const Auth = {
    async login(email, password, options = {}) {
        try {
            console.log('🔐 Login attempt:', email);
            const response = await API.post('/auth/login', { email, password });
            
            if (response.success) {
                AppState.token = response.data.token;
                AppState.user = response.data.user;
                
                localStorage.setItem('token', response.data.token);
                localStorage.setItem('user', JSON.stringify(response.data.user));
                
                Toast.show(`Welcome back, ${response.data.user.first_name}!`, 'success');

                const safeRedirect = typeof options.redirectUrl === 'string'
                    && options.redirectUrl.startsWith('/')
                    && !options.redirectUrl.startsWith('//')
                    ? options.redirectUrl
                    : null;
                
                const go = () => {
                    if (safeRedirect) {
                        window.location.replace(safeRedirect);
                        return;
                    }
                    if (isNativeAppContext()) {
                        const u = response.data.user;
                        const dest =
                            window.AppAuth && typeof AppAuth.homeUrl === 'function'
                                ? AppAuth.homeUrl(u)
                                : u.role === 'admin'
                                  ? '/admin-dashboard.html?app=1'
                                  : u.role === 'worker'
                                    ? '/worker-dashboard.html?app=1'
                                    : '/explore.html?app=1';
                        window.location.replace(dest);
                        return;
                    }
                    if (response.data.user.role === 'admin') {
                        window.location.replace('/admin-dashboard.html');
                    } else if (response.data.user.role === 'worker') {
                        window.location.replace('/worker-dashboard.html');
                    } else {
                        window.location.replace('/customer-dashboard.html');
                    }
                };
                if (IS_EXPO_WEBVIEW) {
                    go();
                } else {
                    setTimeout(go, 1500);
                }
            }
            return response;
        } catch (error) {
            console.error('❌ Login error:', error);
            throw error;
        }
    },
    
    async register(userData) {
        try {
            console.log('📝 Registration attempt:', userData.email);
            const response = await API.post('/auth/register', userData);
            return response;
        } catch (error) {
            console.error('❌ Registration error:', error);
            throw error;
        }
    },
    
    logout() {
        AppState.token = null;
        AppState.user = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        Toast.show('Logged out successfully', 'success');
        const dest = isNativeAppContext() ? '/app-auth.html?app=1' : '/';
        setTimeout(() => window.location.replace(dest), 600);
    },
    
    checkAuth() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        
        if (token && user) {
            try {
                AppState.token = token;
                AppState.user = JSON.parse(user);
                return true;
            } catch (e) {
                console.error('Error parsing user data:', e);
                return false;
            }
        }
        return false;
    },
    
    getUser() { return AppState.user; },
    getToken() { return AppState.token; },

    async refreshSession() {
        const token = localStorage.getItem('token');
        if (!token) return false;
        AppState.token = token;
        try {
            const res = await API.get('/auth/me');
            if (res.success && res.data && res.data.user) {
                AppState.user = res.data.user;
                localStorage.setItem('user', JSON.stringify(res.data.user));
                return true;
            }
        } catch (e) {
            console.warn('Session refresh failed:', e);
            if (e.status === 401) {
                this.tokenInvalidCleanup();
            }
        }
        return false;
    },

    tokenInvalidCleanup() {
        AppState.token = null;
        AppState.user = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },
    
    // Check if current user is admin
    isAdmin() {
        return this.getUser()?.role === 'admin';
    },
    
    // Check if current user is worker
    isWorker() {
        return this.getUser()?.role === 'worker';
    },
    
    // Check if current user is customer
    isCustomer() {
        return this.getUser()?.role === 'customer';
    }
};

// ==================== WORKER API ====================
const WorkerAPI = {
    async getDashboard() {
        try {
            const response = await API.get('/workers/dashboard/stats');
            return response;
        } catch (error) {
            console.error('❌ WorkerAPI.getDashboard error:', error);
            throw error;
        }
    },
    
    async getBookings(status = null) {
        try {
            let url = '/bookings/worker';
            if (status) url += `?status=${status}`;
            const response = await API.get(url);
            return response;
        } catch (error) {
            console.error('❌ WorkerAPI.getBookings error:', error);
            throw error;
        }
    },
    
    async updateAvailability(isAvailable) {
        try {
            const response = await API.put('/workers/availability', { is_available: isAvailable });
            return response;
        } catch (error) {
            console.error('❌ WorkerAPI.updateAvailability error:', error);
            throw error;
        }
    }
};

// ==================== BOOKINGS API ====================
const BookingsAPI = {
    async create(bookingData) {
        try {
            const response = await API.post('/bookings', bookingData);
            return response;
        } catch (error) {
            console.error('❌ BookingsAPI.create error:', error);
            throw error;
        }
    },
    
    async getCustomerBookings(status = null) {
        try {
            let url = '/bookings/customer';
            if (status) url += `?status=${status}`;
            const response = await API.get(url);
            return response;
        } catch (error) {
            console.error('❌ BookingsAPI.getCustomerBookings error:', error);
            throw error;
        }
    },
    
    async getById(bookingId) {
        try {
            const response = await API.get(`/bookings/${bookingId}`);
            return response;
        } catch (error) {
            console.error('❌ BookingsAPI.getById error:', error);
            throw error;
        }
    },
    
    async updateStatus(bookingId, status, reason = null) {
        try {
            const response = await API.put(`/bookings/${bookingId}/status`, { status, reason });
            return response;
        } catch (error) {
            console.error('❌ BookingsAPI.updateStatus error:', error);
            throw error;
        }
    },
    
    async checkAvailability(workerId, date, time, duration) {
        try {
            const response = await API.post('/bookings/check-availability', {
                worker_id: workerId,
                booking_date: date,
                start_time: time,
                duration_hours: duration
            });
            return response;
        } catch (error) {
            console.error('❌ BookingsAPI.checkAvailability error:', error);
            throw error;
        }
    }
};

// ==================== REVIEWS API ====================
const ReviewsAPI = {
    async create(reviewData) {
        try {
            const response = await API.post('/reviews', reviewData);
            return response;
        } catch (error) {
            console.error('❌ ReviewsAPI.create error:', error);
            throw error;
        }
    },
    
    async getWorkerReviews(workerId, page = 1, limit = 10) {
        try {
            const response = await API.get(`/reviews/worker/${workerId}?page=${page}&limit=${limit}`);
            return response;
        } catch (error) {
            console.error('❌ ReviewsAPI.getWorkerReviews error:', error);
            throw error;
        }
    },
    
    async getRecent(limit = 6) {
        try {
            const response = await API.get(`/reviews/recent?limit=${limit}`);
            return response;
        } catch (error) {
            console.error('❌ ReviewsAPI.getRecent error:', error);
            throw error;
        }
    }
};

// ==================== TOAST NOTIFICATION ====================
const Toast = {
    show(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) {
            console.warn('Toast element not found');
            return;
        }
        
        toast.className = `toast ${type} show`;
        toast.innerHTML = `<i class="fas ${this.getIcon(type)}"></i> ${message}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    },
    
    getIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }
};

// ==================== UI HELPERS ====================
const UI = {
    ensureAuthNavStyles() {
        if (document.getElementById('auth-nav-fallback-styles')) return;
        const style = document.createElement('style');
        style.id = 'auth-nav-fallback-styles';
        style.textContent = `
            .auth-nav-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 0.4rem;
                padding: 0.5rem 0.9rem;
                border-radius: 0.6rem;
                border: 1px solid transparent;
                font-weight: 600;
                font-size: 0.92rem;
                line-height: 1;
                text-decoration: none;
                cursor: pointer;
                background: transparent;
                transition: all 0.2s ease;
                white-space: nowrap;
            }
            .auth-nav-outline {
                color: #2563eb;
                border-color: #2563eb;
                background: #ffffff;
            }
            .auth-nav-outline:hover {
                background: #eff6ff;
            }
            .auth-nav-primary {
                color: #ffffff;
                border-color: #2563eb;
                background: #2563eb;
            }
            .auth-nav-primary:hover {
                background: #1d4ed8;
                border-color: #1d4ed8;
            }
            .user-name {
                font-weight: 600;
                color: #374151;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);
    },
    /**
     * Logged-out nav (web). "Become a Pro" → full signup where user can pick Professional.
     */
    standardNavLoggedOutHtml() {
        return `
                <a href="/services.html">Services</a>
                <a href="/register.html">Become a Pro</a>
                <a href="/help.html">Help</a>
                <a href="/login.html" class="btn-outline auth-nav-btn auth-nav-outline">Login</a>
                <a href="/register.html" class="btn-primary auth-nav-btn auth-nav-primary">Sign Up</a>
            `;
    },

    /**
     * Logged-in nav by role: customers see bookings + apply; workers see bookings + pro dashboard.
     */
    standardNavLoggedInHtml(user) {
        const role = user.role || 'customer';
        const first = user.first_name || 'there';
        const help = '<a href="/help.html">Help</a>';
        const hi = `<span class="user-name">Hi, ${first}</span>`;
        const logout = '<button type="button" class="btn-outline auth-nav-btn auth-nav-outline" onclick="Auth.logout()">Logout</button>';

        if (role === 'admin') {
            return `
                <a href="/services.html">Services</a>
                <a href="/admin-dashboard.html">Admin</a>
                <a href="/customer-dashboard.html">My bookings</a>
                ${help}
                ${hi}
                ${logout}
            `;
        }

        if (role === 'worker') {
            return `
                <a href="/services.html">Services</a>
                <a href="/customer-dashboard.html">My bookings</a>
                <a href="/worker-dashboard.html">Pro dashboard</a>
                ${help}
                ${hi}
                ${logout}
            `;
        }

        return `
                <a href="/services.html">Services</a>
                <a href="/customer-dashboard.html">My bookings</a>
                <a href="/become-a-pro.html">Become a Pro</a>
                ${help}
                ${hi}
                ${logout}
            `;
    },

    updateNavbar() {
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;
        UI.ensureAuthNavStyles();
        const user = Auth.getUser();
        const hasSearchBar = !!document.querySelector('.nav-content .search-bar');
        if (hasSearchBar && !document.documentElement.classList.contains('ap-expo-app')) {
            return;
        }

        navLinks.innerHTML = user
            ? UI.standardNavLoggedInHtml(user)
            : UI.standardNavLoggedOutHtml();
        UI.initMobileNav();
    },
    
    showLoader(container) {
        const loader = document.createElement('div');
        loader.className = 'loader';
        loader.innerHTML = '<div class="spinner"></div>';
        container.appendChild(loader);
    },
    
    hideLoader(container) {
        const loader = container.querySelector('.loader');
        if (loader) loader.remove();
    },
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount);
    },
    
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    },

    setNavMenuOpen(navLinks, btn, open) {
        if (!navLinks || !btn) return;
        const icon = btn.querySelector('i');
        navLinks.classList.toggle('show', open);
        navLinks.style.display = open ? 'flex' : 'none';
        navLinks.style.flexDirection = 'column';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.classList.toggle('nav-menu-open', open);
        if (icon) {
            icon.classList.toggle('fa-bars', !open);
            icon.classList.toggle('fa-times', open);
        }
    },

    initMobileNav() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        if (document.documentElement.classList.contains('ap-expo-app')) return;

        navbar.querySelectorAll('.mobile-menu-btn').forEach((btn) => {
            if (btn.dataset.apNavBound === '1') return;
            btn.dataset.apNavBound = '1';
            btn.setAttribute('type', 'button');
            if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Open menu');

            const onPress = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                const navContent = btn.closest('.nav-content');
                let links = navContent?.querySelector('.nav-links');
                if (!links) return;
                if (links.children.length === 0) UI.updateNavbar();
                links = navContent?.querySelector('.nav-links') || links;
                UI.setNavMenuOpen(links, btn, !links.classList.contains('show'));
            };

            btn.addEventListener('click', onPress, true);
        });

        if (window.__apNavOutsideBound) return;
        window.__apNavOutsideBound = true;

        document.addEventListener('click', (e) => {
            setTimeout(() => {
                const openNav = document.querySelector('.navbar .nav-links.show');
                if (!openNav) return;
                const btn = openNav.closest('.nav-content')?.querySelector('.mobile-menu-btn');
                if (openNav.contains(e.target) || btn?.contains(e.target)) return;
                UI.setNavMenuOpen(openNav, btn, false);
            }, 80);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const openNav = document.querySelector('.navbar .nav-links.show');
            if (!openNav) return;
            const btn = openNav.closest('.nav-content')?.querySelector('.mobile-menu-btn');
            UI.setNavMenuOpen(openNav, btn, false);
        });

        navbar.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-links a, .nav-links button');
            if (!link || link.classList.contains('mobile-menu-btn')) return;
            const navLinks = link.closest('.nav-links');
            const btn = navLinks?.closest('.nav-content')?.querySelector('.mobile-menu-btn');
            if (navLinks && btn) UI.setNavMenuOpen(navLinks, btn, false);
        });
    },

    closeDashboardSidebarNav() {
        const sidebarNav = document.querySelector('.dashboard-sidebar .sidebar-nav');
        const sidebar = document.querySelector('.dashboard-sidebar');
        if (!sidebarNav || !sidebar) return;
        sidebarNav.classList.remove('is-open');
        sidebar.querySelector('.dashboard-nav-toggle')?.classList.remove('is-open');
        sidebar.querySelector('.dashboard-nav-toggle')?.setAttribute('aria-expanded', 'false');
    },

    scrollDashboardMainIntoView() {
        const mobile =
            window.matchMedia('(max-width: 1024px)').matches
            || document.documentElement.classList.contains('ap-expo-app');
        if (!mobile) return;
        const mainEl = document.querySelector('.dashboard-main') || document.getElementById('dashboardMain');
        if (!mainEl) return;
        requestAnimationFrame(() => {
            mainEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    },

    enhanceDashboardSidebar() {
        const sidebar = document.querySelector('.dashboard-sidebar');
        const sidebarNav = sidebar?.querySelector('.sidebar-nav');
        if (!sidebar || !sidebarNav) return;
        if (sidebar.dataset.sidebarEnhanced === 'true') {
            const mobile =
                window.matchMedia('(max-width: 1024px)').matches
                || document.documentElement.classList.contains('ap-expo-app');
            if (mobile) {
                sidebar.classList.add('dashboard-sidebar--mobile');
                sidebarNav.classList.add('is-open');
                sidebarNav.style.display = 'flex';
                sidebarNav.style.flexDirection = 'column';
            }
            return;
        }
        sidebar.dataset.sidebarEnhanced = 'true';

        const isMobileLayout = () =>
            window.matchMedia('(max-width: 1024px)').matches
            || document.documentElement.classList.contains('ap-expo-app');
        let toggleBtn = null;

        const getActiveLabel = () => {
            const active = sidebarNav.querySelector('.nav-item.active');
            if (!active) return 'Dashboard sections';
            return active.textContent.replace(/\s+/g, ' ').trim();
        };

        const setNavOpen = (open) => {
            sidebarNav.classList.toggle('is-open', open);
            sidebarNav.style.display = open ? 'flex' : 'none';
            sidebarNav.style.flexDirection = 'column';
            if (toggleBtn) {
                toggleBtn.classList.toggle('is-open', open);
                toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
        };

        const ensureToggle = () => {
            if (!toggleBtn) {
                toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'dashboard-nav-toggle';
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.setAttribute('aria-label', 'Open dashboard sections');
                toggleBtn.innerHTML = '<span class="dashboard-nav-toggle-label"></span><i class="fas fa-chevron-down toggle-icon" aria-hidden="true"></i>';
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sidebar.dataset.navTouched = 'true';
                    setNavOpen(!sidebarNav.classList.contains('is-open'));
                });
                sidebarNav.parentNode.insertBefore(toggleBtn, sidebarNav);
            }
            const label = toggleBtn.querySelector('.dashboard-nav-toggle-label');
            if (label) label.textContent = getActiveLabel();
        };

        const applyLayout = () => {
            if (isMobileLayout()) {
                ensureToggle();
                sidebar.classList.add('dashboard-sidebar--mobile');
                /* Keep menu usable on first paint — user can collapse via toggle */
                if (toggleBtn && !sidebar.dataset.navTouched) {
                    setNavOpen(true);
                }
            } else {
                setNavOpen(false);
                sidebar.classList.remove('dashboard-sidebar--mobile');
            }
        };

        sidebarNav.querySelectorAll('.nav-item').forEach((item) => {
            item.addEventListener('click', () => {
                if (!isMobileLayout()) return;
                const label = toggleBtn?.querySelector('.dashboard-nav-toggle-label');
                if (label) label.textContent = item.textContent.replace(/\s+/g, ' ').trim();
                setNavOpen(false);
                UI.closeDashboardSidebarNav();
                UI.scrollDashboardMainIntoView();
            });
        });

        const observer = new MutationObserver(() => {
            if (!isMobileLayout() || !toggleBtn) return;
            const label = toggleBtn.querySelector('.dashboard-nav-toggle-label');
            if (label) label.textContent = getActiveLabel();
        });
        observer.observe(sidebarNav, { attributes: true, subtree: true, attributeFilter: ['class'] });

        window.matchMedia('(max-width: 1024px)').addEventListener('change', applyLayout);
        applyLayout();
    }
};

// ==================== LEGACY LINK NORMALIZATION ====================
const LinkFixer = {
    routeMap: {
        '/about.html': '/help.html',
        '/careers.html': '/help.html',
        '/blog.html': '/help.html',
        '/press.html': '/help.html',
        '/contact.html': '/help.html',
        '/safety.html': '/help.html',
        '/terms.html': '/help.html',
        '/faq.html': '/help.html',
        '/privacy.html': '/privacypolicy.html',
        '/worker-register.html': '/register.html',
        '/forgot-password.html': '/login.html'
    },

    normalizeUrl(href) {
        if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:')) {
            return href;
        }

        if (/^\/services\/.+\.html$/i.test(href)) {
            return '/services.html';
        }

        return this.routeMap[href] || href;
    },

    apply() {
        const links = document.querySelectorAll('a[href]');
        links.forEach((link) => {
            const oldHref = link.getAttribute('href');
            const newHref = this.normalizeUrl(oldHref);
            if (newHref !== oldHref) {
                link.setAttribute('href', newHref);
            }
        });
    }
};

// ==================== LOCATION SERVICE ====================
const LocationService = {
    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        });
    },
    
    async detectLocation() {
        try {
            Toast.show('Detecting your location...', 'info');
            const position = await this.getCurrentLocation();
            const { latitude, longitude } = position.coords;
            
            // Get city from coordinates (using OpenStreetMap)
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=en`
            );
            const data = await response.json();
            
            const city = data.address?.city || 
                        data.address?.town || 
                        data.address?.village || 
                        'Mumbai';
            
            AppState.currentLocation = { latitude, longitude };
            AppState.selectedCity = city;
            localStorage.setItem('selectedCity', city);
            
            Toast.show(`Location detected: ${city}`, 'success');
            return { latitude, longitude, city };
        } catch (error) {
            console.error('Location detection error:', error);
            Toast.show('Using default location: Mumbai', 'info');
            return { latitude: 19.0760, longitude: 72.8777, city: 'Mumbai' };
        }
    }
};

// ==================== PWA INSTALLATION ====================
const PWA = {
    deferredPrompt: null,
    canPromptInstall: false,
    manualInstallHintShown: false,

    isIOS() {
        return /iphone|ipad|ipod/i.test(navigator.userAgent);
    },

    isInStandaloneMode() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    },

    init() {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        this.updateInstallButtons(false);

        window.addEventListener('beforeinstallprompt', (event) => {
            // Allow native browser install UI while also keeping a handle
            // for the in-app install button.
            this.deferredPrompt = event;
            this.canPromptInstall = true;
            this.updateInstallButtons(true);
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.canPromptInstall = false;
            this.updateInstallButtons(false);
            Toast.show('AP Services installed successfully!', 'success');
        });

        this.registerServiceWorker();
        this.bindInstallButtons();
    },

    async registerServiceWorker() {
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registered');
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
        }
    },

    bindInstallButtons() {
        const installButton = document.getElementById('installAppBtn');
        if (installButton) {
            installButton.addEventListener('click', () => this.install());
        }

        const iosHelpButton = document.getElementById('iosInstallHelpBtn');
        if (iosHelpButton) {
            iosHelpButton.addEventListener('click', () => {
                Toast.show('On iPhone: Share -> Add to Home Screen', 'info', 5000);
            });
        }

        this.updateInstallButtons(this.canPromptInstall);
    },

    updateInstallButtons(canInstall) {
        const installButton = document.getElementById('installAppBtn');
        const iosHelpButton = document.getElementById('iosInstallHelpBtn');
        if (!installButton && !iosHelpButton) return;

        const installed = this.isInStandaloneMode();
        const isIOS = this.isIOS();

        if (installButton) {
            // Keep visible on non-iOS so users can still see manual install guidance
            // even when beforeinstallprompt has not fired yet.
            installButton.style.display = (!installed && !isIOS) ? 'flex' : 'none';
            installButton.disabled = false;
        }

        if (iosHelpButton) {
            iosHelpButton.style.display = (!installed && isIOS) ? 'flex' : 'none';
        }
    },

    async install() {
        if (!this.deferredPrompt) {
            if (this.isInStandaloneMode()) {
                Toast.show('App is already installed on this device.', 'info');
                return;
            }
            if (this.isIOS()) {
                Toast.show('On iPhone: Share -> Add to Home Screen', 'info', 5000);
                return;
            }
            return;
        }

        this.deferredPrompt.prompt();
        const choiceResult = await this.deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
            Toast.show('Installing AP Services...', 'info');
        }
        this.deferredPrompt = null;
        this.canPromptInstall = false;
        this.updateInstallButtons(false);
    }
};

// ==================== NATIVE APP SHELL (all pages) ====================
function isAuthPath() {
    const path = (window.location.pathname || '').toLowerCase();
    return (
        path.endsWith('/app-auth.html') ||
        path.endsWith('/login.html') ||
        path.endsWith('/register.html') ||
        path.endsWith('/login-success.html')
    );
}

function bootstrapNativeAppShell() {
    if (!isNativeAppContext()) return;
    document.documentElement.classList.add('ap-expo-app', 'social-app');
    window.__AP_NATIVE_APP__ = true;
    if (!document.querySelector('link[href*="social-theme.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/social-theme.css';
        document.head.appendChild(link);
    }
    if (!document.querySelector('script[src*="auth-guard.js"]')) {
        const guard = document.createElement('script');
        guard.src = '/auth-guard.js';
        guard.async = false;
        document.head.appendChild(guard);
    }
    if (!isAuthPath() && localStorage.getItem('token')) {
        if (!document.querySelector('script[src*="social-bridge.js"]')) {
            const script = document.createElement('script');
            script.src = '/social-bridge.js';
            script.async = true;
            document.head.appendChild(script);
        }
        if (!document.querySelector('script[src*="social-shell.js"]')) {
            const shell = document.createElement('script');
            shell.src = '/social-shell.js';
            shell.async = true;
            document.head.appendChild(shell);
        }
    }
}

bootstrapNativeAppShell();

// ==================== INITIALIZE ====================
function loadSocialShellIfNeeded() {
    const path = (window.location.pathname || '').replace(/\/$/, '');
    const socialPages = [
        '/explore.html', '/party.html', '/video.html', '/square.html', '/topics.html',
        '/store.html', '/vip.html', '/rankings.html', '/profile-tab.html', '/privileges.html',
    ];
    const isSocial = socialPages.some((p) => path.endsWith(p));
    if (isSocial || isNativeAppContext()) {
        document.documentElement.classList.add('social-app');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ DOM loaded');
    loadSocialShellIfNeeded();
    if (isNativeAppContext()) {
        document.documentElement.classList.add('ap-expo-app');
    }
    const launchParams = new URLSearchParams(window.location.search);
    const appRedirectFromQuery = launchParams.get('app_redirect');
    if (appRedirectFromQuery) {
        localStorage.setItem('app_redirect', appRedirectFromQuery);
    }
    Auth.checkAuth();
    if (AppState.token) {
        await Auth.refreshSession();
    }
    if (!isNativeAppContext()) {
        UI.updateNavbar();
        UI.initMobileNav();
    }
    UI.enhanceDashboardSidebar();

    const navLinksEl = document.querySelector('.navbar .nav-links');
    if (navLinksEl && !navLinksEl.dataset.navObserveInit) {
        navLinksEl.dataset.navObserveInit = 'true';
        new MutationObserver(() => UI.initMobileNav()).observe(navLinksEl, { childList: true, subtree: true });
    }
    LinkFixer.apply();
    PWA.init();
});

// Run dashboard mobile nav as soon as sidebar exists (avoids wide horizontal pill flash)
if (document.querySelector('.dashboard-sidebar')) {
    const runSidebarEnhance = () => {
        if (typeof UI !== 'undefined' && UI.enhanceDashboardSidebar) {
            UI.enhanceDashboardSidebar();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSidebarEnhance);
    } else {
        runSidebarEnhance();
    }
}

// Make all functions globally available
window.AppState = AppState;
window.Auth = Auth;
window.API = API;
window.AdminAPI = AdminAPI;
window.ServicesAPI = ServicesAPI;
window.WorkerAPI = WorkerAPI;
window.BookingsAPI = BookingsAPI;
window.ReviewsAPI = ReviewsAPI;
window.Toast = Toast;
window.UI = UI;
window.LinkFixer = LinkFixer;
window.LocationService = LocationService;
window.PWA = PWA;
window.CONFIG = CONFIG;

console.log('✅ App.js initialized');
console.log('📦 Available APIs:', { 
    ServicesAPI, 
    Auth, 
    API,
    AdminAPI,
    WorkerAPI,
    BookingsAPI,
    ReviewsAPI
});
