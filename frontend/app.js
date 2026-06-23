// frontend/app.js
// AP Services Frontend - Complete Working Version with FormData Support

// ==================== CONFIGURATION ====================
const AP = window.AP_CONFIG || {
    PRODUCTION_BACKEND_URL: 'https://api.apservices.in',
    PRODUCTION_API_URL: 'https://api.apservices.in/api',
    PRODUCTION_FRONTEND_URL: 'https://api.apservices.in',
    OAUTH_CALLBACK_BASE: 'https://api.apservices.in',
};
window.AP_CONFIG = AP;

const LIVE_FRONTEND_URL = AP.PRODUCTION_FRONTEND_URL;
const LIVE_API_URL = AP.PRODUCTION_API_URL;
const LIVE_BACKEND_URL = AP.PRODUCTION_BACKEND_URL;
const LOCAL_API_URL = 'http://localhost:5000/api';
const LOCAL_FRONTEND_URL = 'http://localhost:5500';

const IS_CAPACITOR = Boolean(window.Capacitor?.isNativePlatform?.());
const IS_EXPO_WEBVIEW = Boolean(window.ReactNativeWebView);
const IS_LOCAL = !IS_CAPACITOR && !IS_EXPO_WEBVIEW && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function isLanDevHost() {
    const h = window.location.hostname || '';
    return (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
    );
}

function isVercelHost() {
    return /\.vercel\.app$/i.test(window.location.hostname || '');
}

function resolveApiUrl() {
    // Expo LAN dev: same-origin /api via dev-server proxy (avoids cross-origin CORS in WebView)
    if (IS_EXPO_WEBVIEW && isLanDevHost() && (window.location.port === '5500' || window.location.port === '')) {
        return `${window.location.origin.replace(/\/$/, '')}/api`;
    }
    if (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) {
        return window.__AP_API_URL__.replace(/\/$/, '');
    }
    if (IS_EXPO_WEBVIEW || IS_CAPACITOR || window.__AP_NATIVE_APP__) {
        return LIVE_API_URL;
    }
    if (isLanDevHost() && (window.location.port === '5500' || window.location.port === '')) {
        return `${window.location.origin.replace(/\/$/, '')}/api`;
    }
    if (isVercelHost()) {
        return `${window.location.origin.replace(/\/$/, '')}/api`;
    }
    if (IS_LOCAL) return LOCAL_API_URL;
    return LIVE_API_URL;
}

function resolveBackendUrl() {
    if (IS_EXPO_WEBVIEW && isLanDevHost() && (window.location.port === '5500' || window.location.port === '')) {
        return window.location.origin.replace(/\/$/, '');
    }
    if (typeof window.__AP_API_URL__ === 'string' && window.__AP_API_URL__) {
        return window.__AP_API_URL__.replace(/\/api\/?$/, '');
    }
    if (IS_EXPO_WEBVIEW || IS_CAPACITOR || window.__AP_NATIVE_APP__) {
        return LIVE_BACKEND_URL;
    }
    if (isVercelHost()) {
        return LIVE_BACKEND_URL;
    }
    if (isLanDevHost() && (window.location.port === '5500' || window.location.port === '')) {
        return window.location.origin.replace(/\/$/, '');
    }
    return resolveApiUrl().replace(/\/api\/?$/, '');
}

function isNativeAppContext() {
    if (window.__AP_NATIVE_APP__) return true;
    if (IS_EXPO_WEBVIEW || IS_CAPACITOR) return true;
    const q = new URLSearchParams(window.location.search);
    return q.get('app') === '1' || q.get('source') === 'expo-app';
}

const CONFIG = {
    API_URL: resolveApiUrl(),
    BACKEND_URL: resolveBackendUrl(),
    FRONTEND_URL: IS_LOCAL ? LOCAL_FRONTEND_URL : LIVE_FRONTEND_URL,
};
window.CONFIG = CONFIG;

console.log('≡ƒÜÇ App.js loaded');
console.log('≡ƒôí API URL:', CONFIG.API_URL);
console.log('≡ƒöî Backend URL:', CONFIG.BACKEND_URL);

// ==================== STATE MANAGEMENT ====================
const AppState = {
    user: null,
    token: null,
    currentLocation: null,
    selectedCity: localStorage.getItem('selectedCity') || 'Mumbai'
};

/** Hydrate session synchronously so auth-guard (next script) sees logged-in state */
(function hydrateNativeSessionEarly() {
    if (!isNativeAppContext()) return;
    try {
        const raw = localStorage.getItem('user');
        if (raw) AppState.user = JSON.parse(raw);
        const tok = localStorage.getItem('token');
        if (tok) AppState.token = tok;
    } catch (_e) {
        /* ignore */
    }
})();

function parseJwtPayload(token) {
    try {
        const parts = String(token).split('.');
        if (parts.length !== 3) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(b64));
    } catch (_e) {
        return null;
    }
}

function isAccessTokenUsable(token, skewSec = 30) {
    if (!token) return false;
    const payload = parseJwtPayload(token);
    if (!payload?.exp) return true;
    return payload.exp > Math.floor(Date.now() / 1000) + skewSec;
}

function storeSessionTokens(data = {}) {
    if (data.accessToken) {
        localStorage.setItem('token', data.accessToken);
        AppState.token = data.accessToken;
    }
    if (data.refreshToken) {
        localStorage.setItem('ap_refresh_token', data.refreshToken);
    }
}

function clearSessionTokens() {
    AppState.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('ap_refresh_token');
}

function loginDestination(redirectAfter) {
    if (isNativeAppContext()) {
        return '/app-auth.html?app=1';
    }
    if (redirectAfter) {
        return `/login.html?redirect=${encodeURIComponent(redirectAfter)}`;
    }
    return '/login.html';
}

// ==================== API SERVICE WITH FORMDATA SUPPORT ====================
const API = {
    async request(endpoint, options = {}) {
        try {
            return await this._fetchOnce(`${CONFIG.API_URL}${endpoint}`, options);
        } catch (error) {
            throw this._friendlyNetworkError(error, `${CONFIG.API_URL}${endpoint}`);
        }
    },

    _friendlyNetworkError(error, url) {
        const msg = error?.message || 'Request failed';
        if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
            const err = new Error(
                'Cannot reach the server. Check your internet connection and try again. (' + url + ')'
            );
            err.cause = error;
            return err;
        }
        return error;
    },

    async _fetchOnce(url, options = {}, retried = false) {
        console.log(`≡ƒôí API Request: ${options.method || 'GET'} ${url}`);

        if (typeof Auth !== 'undefined' && Auth.ensureAccessToken) {
            await Auth.ensureAccessToken();
        }

        const headers = { ...options.headers };
        const legacyToken = localStorage.getItem('token');
        if (legacyToken) {
            headers['Authorization'] = `Bearer ${legacyToken}`;
        }

        const isFormData = options.body instanceof FormData;
        if (!isFormData && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        let body = options.body;
        if (!isFormData && body && typeof body === 'object') {
            body = JSON.stringify(body);
        }

        const response = await fetch(url, {
            ...options,
            headers,
            body,
            mode: 'cors',
            credentials: 'include',
        });

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (response.status === 401 && !retried && !String(url).includes('/auth/refresh') && !String(url).includes('/auth/login')) {
            let refreshed = await Auth.tryRefresh();
            if (!refreshed && isNativeAppContext() && Auth.requestNativeSession) {
                await Auth.requestNativeSession();
                refreshed = await Auth.tryRefresh();
            }
            if (refreshed) {
                return this._fetchOnce(url, options, true);
            }
        }

        if (!response.ok) {
            console.error('Γ¥î API Error Response:', data);
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

        console.log('Γ£à API Success:', data);
        return data;
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
            
            console.log('≡ƒöì Fetching services:', url);
            const response = await API.get(url);
            return response;
        } catch (error) {
            console.error('Γ¥î ServicesAPI.getAll error:', error);
            throw error;
        }
    },
    
    async getById(id) {
        try {
            const response = await API.get(`/services/${id}`);
            return response;
        } catch (error) {
            console.error('Γ¥î ServicesAPI.getById error:', error);
            throw error;
        }
    },
    
    async getPopular(limit = 6) {
        try {
            const response = await API.get(`/services/popular?limit=${limit}`);
            return response;
        } catch (error) {
            console.error('Γ¥î ServicesAPI.getPopular error:', error);
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
            console.error('Γ¥î AdminAPI.getServices error:', error);
            throw error;
        }
    },
    
    // Create service with image upload
    async createService(formData) {
        try {
            const response = await API.upload('/admin/services', formData, 'POST');
            return response;
        } catch (error) {
            console.error('Γ¥î AdminAPI.createService error:', error);
            throw error;
        }
    },
    
    // Update service with image upload
    async updateService(serviceId, formData) {
        try {
            const response = await API.upload(`/admin/services/${serviceId}`, formData, 'PUT');
            return response;
        } catch (error) {
            console.error('Γ¥î AdminAPI.updateService error:', error);
            throw error;
        }
    },
    
    // Delete service
    async deleteService(serviceId) {
        try {
            const response = await API.delete(`/admin/services/${serviceId}`);
            return response;
        } catch (error) {
            console.error('Γ¥î AdminAPI.deleteService error:', error);
            throw error;
        }
    },
    
    // Get dashboard stats
    async getDashboardStats() {
        try {
            const response = await API.get('/admin/dashboard/stats');
            return response;
        } catch (error) {
            console.error('Γ¥î AdminAPI.getDashboardStats error:', error);
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
            console.error('Γ¥î AdminAPI.getUsers error:', error);
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
            console.error('Γ¥î AdminAPI.getWorkers error:', error);
            throw error;
        }
    },
    
    // Approve worker
    async approveWorker(workerId, status) {
        try {
            const response = await API.put(`/admin/workers/${workerId}/approve`, { status });
            return response;
        } catch (error) {
            console.error('Γ¥î AdminAPI.approveWorker error:', error);
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
            console.error('Γ¥î AdminAPI.getBookings error:', error);
            throw error;
        }
    },
    
    // Get analytics
    async getAnalytics(period = 'month') {
        try {
            const response = await API.get(`/admin/analytics?period=${period}`);
            return response;
        } catch (error) {
            console.error('Γ¥î AdminAPI.getAnalytics error:', error);
            throw error;
        }
    }
};

// ==================== AUTH SERVICE ====================
const Auth = {
    async login(email, password, options = {}) {
        try {
            console.log('≡ƒöÉ Login attempt:', email);
            const response = await API.post('/auth/login', { email, password });
            
            if (response.success) {
                AppState.user = response.data.user;
                storeSessionTokens(response.data);
                localStorage.setItem('user', JSON.stringify(response.data.user));
                
                Toast.show(`Welcome back, ${response.data.user.first_name}!`, 'success');

                if (window.ReactNativeWebView) {
                    try {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'login',
                            user: response.data.user,
                            accessToken: response.data.accessToken || null,
                            refreshToken: response.data.refreshToken || null,
                        }));
                    } catch (_e) { /* ignore */ }
                }

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
                        if (window.AppAuth && typeof AppAuth.completeLoginAndEnterApp === 'function') {
                            AppAuth.completeLoginAndEnterApp(response.data.user);
                            return;
                        }
                        const u = response.data.user;
                        const dest =
                            u.role === 'admin'
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
            console.error('Γ¥î Login error:', error);
            throw error;
        }
    },
    
    async register(userData) {
        try {
            console.log('≡ƒô¥ Registration attempt:', userData.email);
            const response = await API.post('/auth/register', userData);
            return response;
        } catch (error) {
            console.error('Γ¥î Registration error:', error);
            throw error;
        }
    },
    
    async logout() {
        try {
            await API.post('/auth/logout', {});
        } catch (_e) {
            /* ignore */
        }
        AppState.token = null;
        AppState.user = null;
        clearSessionTokens();
        localStorage.removeItem('user');
        if (window.ReactNativeWebView) {
            try {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'logout' }));
            } catch (_e) { /* ignore */ }
        }
        Toast.show('Logged out successfully', 'success');
        const dest = isNativeAppContext() ? '/app-auth.html?app=1' : '/';
        setTimeout(() => window.location.replace(dest), 600);
    },
    
    checkAuth() {
        const user = localStorage.getItem('user');
        if (user) {
            try {
                AppState.user = JSON.parse(user);
                return true;
            } catch (e) {
                console.error('Error parsing user data:', e);
                return false;
            }
        }
        return false;
    },

    hasSession() {
        return Boolean(localStorage.getItem('user') || localStorage.getItem('token'));
    },

    requestNativeSession() {
        if (!window.ReactNativeWebView) return Promise.resolve(false);
        if (this._nativeSessionPromise) return this._nativeSessionPromise;
        this._nativeSessionPromise = new Promise((resolve) => {
            let settled = false;
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                window.removeEventListener('ap-session-injected', onInjected);
                this._nativeSessionPromise = null;
                resolve(ok);
            };
            const onInjected = () => finish(true);
            window.addEventListener('ap-session-injected', onInjected);
            try {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'request_session' }));
            } catch (_e) {
                finish(false);
                return;
            }
            setTimeout(() => finish(false), 4000);
        });
        return this._nativeSessionPromise;
    },

    async repairSession() {
        const existing = localStorage.getItem('token');
        if (existing && isAccessTokenUsable(existing)) return true;
        await this.ensureAccessToken();
        const tok = localStorage.getItem('token');
        if (tok && isAccessTokenUsable(tok)) return true;
        if (isNativeAppContext()) {
            await this.requestNativeSession();
            if (await this.tryRefresh()) return true;
            const tok2 = localStorage.getItem('token');
            if (tok2 && isAccessTokenUsable(tok2)) return true;
        }
        return false;
    },

    redirectToLogin(message, redirectAfter) {
        if (message) Toast.show(message, 'error');
        const dest = loginDestination(redirectAfter || window.location.href);
        setTimeout(() => window.location.replace(dest), message ? 900 : 0);
    },

    async ensureAccessToken() {
        const existing = localStorage.getItem('token');
        if (existing && isAccessTokenUsable(existing)) return existing;
        if (existing && !isAccessTokenUsable(existing)) {
            localStorage.removeItem('token');
            AppState.token = null;
        }
        if (!localStorage.getItem('user')) return null;
        if (this._ensuringToken) return this._ensuringToken;

        this._ensuringToken = (async () => {
            try {
                let ok = await this.tryRefresh();
                if (ok) return localStorage.getItem('token');

                if (isNativeAppContext()) {
                    await this.requestNativeSession();
                    ok = await this.tryRefresh();
                    if (ok) return localStorage.getItem('token');
                }

                if (!isNativeAppContext()) {
                    const res = await fetch(`${CONFIG.API_URL}/auth/ws-token`, {
                        method: 'GET',
                        credentials: 'include',
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok && data.success && data.data?.accessToken) {
                        storeSessionTokens(data.data);
                        return data.data.accessToken;
                    }
                }
            } catch (_e) {
                /* ignore */
            }
            return localStorage.getItem('token');
        })();

        try {
            return await this._ensuringToken;
        } finally {
            this._ensuringToken = null;
        }
    },
    
    getUser() { return AppState.user; },
    getToken() { return AppState.token || localStorage.getItem('token'); },
    isAccessTokenUsable,

    async tryRefresh() {
        if (this._refreshing) return this._refreshing;
        this._refreshing = (async () => {
            try {
                const body = {};
                const refreshToken = localStorage.getItem('ap_refresh_token');
                if (refreshToken) body.refreshToken = refreshToken;
                const res = await fetch(`${CONFIG.API_URL}/auth/refresh`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success && data.data?.user) {
                    AppState.user = data.data.user;
                    localStorage.setItem('user', JSON.stringify(data.data.user));
                    storeSessionTokens(data.data);
                    return true;
                }
                return false;
            } catch (_e) {
                return false;
            } finally {
                this._refreshing = null;
            }
        })();
        return this._refreshing;
    },

    async refreshSession() {
        const cached = localStorage.getItem('user');
        if (cached) {
            try {
                AppState.user = JSON.parse(cached);
            } catch (_e) {
                /* ignore */
            }
        }

        await this.ensureAccessToken();

        try {
            const res = await API.get('/auth/me');
            if (res.success && res.data && res.data.user) {
                AppState.user = res.data.user;
                localStorage.setItem('user', JSON.stringify(res.data.user));
                if (res.data.accessToken) {
                    localStorage.setItem('token', res.data.accessToken);
                }
                return true;
            }
        } catch (e) {
            console.warn('Session refresh failed:', e);
            if (e.status === 401) {
                let ok = await this.tryRefresh();
                if (!ok && isNativeAppContext()) {
                    await this.requestNativeSession();
                    ok = await this.tryRefresh();
                }
                if (ok) return this.refreshSession();
                if (isNativeAppContext() && localStorage.getItem('user')) {
                    return false;
                }
                this.tokenInvalidCleanup();
                return false;
            }
            // Network/CORS blip ΓÇö keep cached session in native app
            if (isNativeAppContext() && (localStorage.getItem('user') || localStorage.getItem('token'))) {
                return true;
            }
            return Boolean(AppState.user || localStorage.getItem('user'));
        }
        return Boolean(AppState.user || localStorage.getItem('user'));
    },

    tokenInvalidCleanup() {
        AppState.token = null;
        AppState.user = null;
        clearSessionTokens();
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
            console.error('Γ¥î WorkerAPI.getDashboard error:', error);
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
            console.error('Γ¥î WorkerAPI.getBookings error:', error);
            throw error;
        }
    },
    
    async updateAvailability(isAvailable) {
        try {
            const response = await API.put('/workers/availability', { is_available: isAvailable });
            return response;
        } catch (error) {
            console.error('Γ¥î WorkerAPI.updateAvailability error:', error);
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
            console.error('Γ¥î BookingsAPI.create error:', error);
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
            console.error('Γ¥î BookingsAPI.getCustomerBookings error:', error);
            throw error;
        }
    },
    
    async getById(bookingId) {
        try {
            const response = await API.get(`/bookings/${bookingId}`);
            return response;
        } catch (error) {
            console.error('Γ¥î BookingsAPI.getById error:', error);
            throw error;
        }
    },
    
    async updateStatus(bookingId, status, reason = null) {
        try {
            const response = await API.put(`/bookings/${bookingId}/status`, { status, reason });
            return response;
        } catch (error) {
            console.error('Γ¥î BookingsAPI.updateStatus error:', error);
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
            console.error('Γ¥î BookingsAPI.checkAvailability error:', error);
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
            console.error('Γ¥î ReviewsAPI.create error:', error);
            throw error;
        }
    },
    
    async getWorkerReviews(workerId, page = 1, limit = 10) {
        try {
            const response = await API.get(`/reviews/worker/${workerId}?page=${page}&limit=${limit}`);
            return response;
        } catch (error) {
            console.error('Γ¥î ReviewsAPI.getWorkerReviews error:', error);
            throw error;
        }
    },
    
    async getRecent(limit = 6) {
        try {
            const response = await API.get(`/reviews/recent?limit=${limit}`);
            return response;
        } catch (error) {
            console.error('Γ¥î ReviewsAPI.getRecent error:', error);
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
     * Logged-out nav (web). "Become a Pro" ΓåÆ full signup where user can pick Professional.
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
                /* Keep menu usable on first paint ΓÇö user can collapse via toggle */
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
        if (isNativeAppContext()) {
            this.unregisterServiceWorkers();
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

    async unregisterServiceWorkers() {
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
            if (window.caches) {
              const keys = await caches.keys();
              await Promise.all(keys.map((k) => caches.delete(k)));
            }
        } catch (_e) {
            /* ignore */
        }
    },

    async registerServiceWorker() {
        if (isNativeAppContext()) return;
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log('Γ£à Service Worker registered');
        } catch (error) {
            console.error('Γ¥î Service Worker registration failed:', error);
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
function pathEnds(p) {
    return (window.location.pathname || '').toLowerCase().endsWith(p);
}

function isAuthPath() {
    return (
        pathEnds('/app-auth.html') ||
        pathEnds('/login.html') ||
        pathEnds('/register.html') ||
        pathEnds('/login-success.html')
    );
}

function isImmersiveLivePath() {
    return pathEnds('/live-room.html') || pathEnds('/party-room.html');
}

function bootstrapNativeAppShell() {
    if (!isNativeAppContext()) return;
    window.__AP_NATIVE_APP__ = true;
    document.documentElement.classList.add('ap-expo-app');
    if (isImmersiveLivePath()) {
        document.documentElement.classList.add('ap-live-immersive');
        if (document.body) document.body.classList.add('ap-live-immersive');
        return;
    }
    document.documentElement.classList.add('social-app', 'social-bridge-mode', 'social-native');
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
    const socialScripts = [
        '/social-bridge.js',
        '/social-banner-slider.js',
        '/social-create-post.js',
        '/social-shell.js',
    ];
    if (!isAuthPath() && (localStorage.getItem('user') || localStorage.getItem('token'))) {
        socialScripts.forEach((src) => {
            if (!document.querySelector(`script[src*="${src.split('/').pop()}"]`)) {
                const script = document.createElement('script');
                script.src = src;
                script.async = false;
                document.head.appendChild(script);
            }
        });
    }
}

bootstrapNativeAppShell();

// ==================== INITIALIZE ====================
function loadSocialShellIfNeeded() {
    const path = (window.location.pathname || '').replace(/\/$/, '');
    const socialPages = [
        '/explore.html', '/party.html', '/video.html', '/square.html', '/topics.html',
        '/store.html', '/vip.html', '/rankings.html', '/profile-tab.html', '/privileges.html',
        '/points.html', '/withdraw.html', '/withdraw-details.html', '/withdraw-notices.html',
        '/chat.html',
    ];
    const isSocial = socialPages.some((p) => path.endsWith(p));
    if ((isSocial || isNativeAppContext()) && !isImmersiveLivePath()) {
        document.documentElement.classList.add('social-app');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Γ£à DOM loaded');
    loadSocialShellIfNeeded();
    if (isImmersiveLivePath()) {
        document.documentElement.classList.add('ap-expo-app', 'ap-live-immersive');
        document.documentElement.classList.remove('social-bridge-mode');
        document.documentElement.style.setProperty('--social-bottom-nav-h', '0px');
        if (document.body) {
            document.body.classList.add('ap-live-immersive');
            document.body.style.setProperty('background', '#000', 'important');
        }
        if (window.AppAuth?.watchImmersiveLiveChrome) {
            window.AppAuth.watchImmersiveLiveChrome();
        }
    } else if (isNativeAppContext()) {
        document.documentElement.classList.add('ap-expo-app');
    }
    const onAuthScreen =
        pathEnds('/app-auth.html') ||
        pathEnds('/login.html') ||
        pathEnds('/register.html') ||
        pathEnds('/login-success.html');
    const hasNativeSession =
        Boolean(localStorage.getItem('user')) ||
        Boolean(localStorage.getItem('token')) ||
        document.cookie.includes('ap_access');
    if (isNativeAppContext() && !onAuthScreen && !hasNativeSession) {
        setTimeout(() => {
            const has =
                localStorage.getItem('user') ||
                localStorage.getItem('token') ||
                (typeof window.__AP_HAS_NATIVE_SESSION__ === 'function' && window.__AP_HAS_NATIVE_SESSION__());
            if (!has) {
                window.location.replace('/app-auth.html?app=1');
            }
        }, 500);
        return;
    }
    const launchParams = new URLSearchParams(window.location.search);
    const appRedirectFromQuery = launchParams.get('app_redirect');
    if (appRedirectFromQuery) {
        localStorage.setItem('app_redirect', appRedirectFromQuery);
    }
    Auth.checkAuth();
    if (Auth.hasSession()) {
        if (!(isNativeAppContext() && onAuthScreen)) {
            if (isNativeAppContext()) {
                Auth.ensureAccessToken().catch(() => {});
                Auth.refreshSession().catch(() => {});
            } else {
                await Auth.ensureAccessToken();
                await Auth.refreshSession();
            }
        }
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
    if (!isNativeAppContext()) {
        PWA.init();
    }
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

console.log('Γ£à App.js initialized');
console.log('≡ƒôª Available APIs:', { 
    ServicesAPI, 
    Auth, 
    API,
    AdminAPI,
    WorkerAPI,
    BookingsAPI,
    ReviewsAPI
});
