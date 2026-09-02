import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { ApiClient, displayName } from '../lib/apiClient';
import { clearSession, loadSession, saveSession } from '../lib/storage';
import { oauthStartUrl } from '../config/api';
import { registerForPushNotificationsAsync, uploadPushToken } from '../lib/push';

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [booting, setBooting] = useState(true);
  const oauthBusy = useRef(false);

  const accessTokenRef = useRef(null);
  const refreshTokenRef = useRef(null);
  const userRef = useRef(null);
  accessTokenRef.current = accessToken;
  refreshTokenRef.current = refreshToken;
  userRef.current = user;

  const persist = useCallback(async (sess) => {
    setUser(sess.user || null);
    if (sess.accessToken) setAccessToken(sess.accessToken);
    if (sess.refreshToken) setRefreshToken(sess.refreshToken);
    await saveSession({
      user: sess.user,
      accessToken: sess.accessToken,
      refreshToken: sess.refreshToken,
    });
  }, []);

  const apiRef = useRef(null);
  const refreshSession = useCallback(async () => {
    const rt = refreshTokenRef.current;
    if (!rt) return accessTokenRef.current;
    try {
      const res = await fetch(`${require('../config/api').API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data?.accessToken) {
        const next = {
          user: json.data.user || userRef.current,
          accessToken: json.data.accessToken,
          refreshToken: json.data.refreshToken || rt,
        };
        await persist(next);
        return next.accessToken;
      }
    } catch (_e) {}
    return accessTokenRef.current;
  }, [persist]);

  if (!apiRef.current) {
    apiRef.current = new ApiClient(
      async () => accessTokenRef.current,
      async () => refreshSession()
    );
  }
  apiRef.current.tokenProvider = async () => accessTokenRef.current;
  apiRef.current.refreshHandler = async () => refreshSession();

  const api = apiRef.current;

  useEffect(() => {
    (async () => {
      try {
        const sess = await loadSession();
        if (sess.user && sess.accessToken) {
          setUser(sess.user);
          setAccessToken(sess.accessToken);
          setRefreshToken(sess.refreshToken);
        }
      } finally {
        setReady(true);
        setBooting(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready || !accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await api.get('/auth/me');
        const next = json.data?.user || json.data;
        if (!cancelled && next && next.id) {
          await persist({ user: next, accessToken, refreshToken });
        }
      } catch (_e) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const applyAuthPayload = useCallback(
    async (json) => {
      const data = json.data || json;
      const nextUser = data.user;
      const nextAccess = data.accessToken || data.token;
      const nextRefresh = data.refreshToken;
      if (!nextUser || !nextAccess) {
        throw new Error(json.message || 'Login failed');
      }
      await persist({ user: nextUser, accessToken: nextAccess, refreshToken: nextRefresh });
      try {
        const info = await registerForPushNotificationsAsync();
        if (info?.token) await uploadPushToken(nextAccess, info);
      } catch (_e) {}
      return nextUser;
    },
    [persist]
  );

  const login = useCallback(
    async (email, password) => {
      const json = await api.post('/auth/login', { email, password }, { auth: false });
      if (json.success === false) throw new Error(json.message || 'Login failed');
      return applyAuthPayload(json);
    },
    [api, applyAuthPayload]
  );

  const register = useCallback(
    async (payload) => {
      const json = await api.post(
        '/auth/register',
        { ...payload, user_type: 'customer' },
        { auth: false }
      );
      if (json.success === false) throw new Error(json.message || 'Registration failed');
      if (json.data?.accessToken) return applyAuthPayload(json);
      return login(payload.email, payload.password);
    },
    [api, applyAuthPayload, login]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (_e) {}
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    await clearSession();
  }, [api]);

  const exchangeOAuthCode = useCallback(
    async (code) => {
      const json = await api.post('/auth/exchange-code', { code }, { auth: false });
      if (json.success === false) throw new Error(json.message || 'OAuth failed');
      return applyAuthPayload(json);
    },
    [api, applyAuthPayload]
  );

  const sendPhoneOtp = useCallback(
    async ({ phone, country = 'IN' }) => {
      const json = await api.post('/auth/phone/send-otp', { phone, country }, { auth: false });
      if (json.success === false) throw new Error(json.message || 'Could not send OTP');
      return json.data || {};
    },
    [api]
  );

  const verifyPhoneOtp = useCallback(
    async ({ phone, code, country = 'IN' }) => {
      const json = await api.post('/auth/phone/verify-otp', { phone, code, country }, { auth: false });
      if (json.success === false) throw new Error(json.message || 'Verification failed');
      return applyAuthPayload(json);
    },
    [api, applyAuthPayload]
  );

  const startOAuth = useCallback(
    async (provider) => {
      if (oauthBusy.current) return;
      oauthBusy.current = true;
      const returnUrl = Linking.createURL('oauth-complete');
      const authUrl = oauthStartUrl(provider, returnUrl);
      try {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, {
          showInRecents: true,
        });
        if (result.type === 'success' && result.url) {
          const parsed = Linking.parse(result.url);
          const code = parsed?.queryParams?.code;
          const token = parsed?.queryParams?.token;
          if (code) await exchangeOAuthCode(String(Array.isArray(code) ? code[0] : code));
          else if (token) {
            const json = await api.get('/auth/me', null, {
              auth: true,
              headers: { Authorization: `Bearer ${token}` },
            });
            await applyAuthPayload({
              success: true,
              data: { user: json.data?.user || json.data, accessToken: token },
            });
          }
        }
      } finally {
        oauthBusy.current = false;
        try {
          await WebBrowser.dismissBrowser();
        } catch (_e) {}
      }
    },
    [api, applyAuthPayload, exchangeOAuthCode]
  );

  const updateProfile = useCallback(
    async (fields) => {
      const json = await api.patch('/auth/profile', fields);
      const next = json.data?.user || json.data || { ...user, ...fields };
      await persist({ user: next, accessToken, refreshToken });
      return next;
    },
    [accessToken, api, persist, refreshToken, user]
  );

  const refreshUser = useCallback(async () => {
    try {
      const json = await api.get('/auth/me', null, { skipCache: true }).catch(() => api.get('/auth/profile', null, { skipCache: true }));
      const next = json.data?.user || json.data || json.user;
      if (next && next.id) await persist({ user: { ...userRef.current, ...next }, accessToken: accessTokenRef.current, refreshToken: refreshTokenRef.current });
    } catch (_e) {}
  }, [api, persist]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      ready,
      booting,
      isLoggedIn: Boolean(user && accessToken),
      displayName: displayName(user),
      api,
      login,
      register,
      logout,
      startOAuth,
      sendPhoneOtp,
      verifyPhoneOtp,
      exchangeOAuthCode,
      updateProfile,
      refreshUser,
      refreshSession,
    }),
    [
      accessToken,
      booting,
      exchangeOAuthCode,
      login,
      logout,
      ready,
      refreshSession,
      refreshToken,
      register,
      startOAuth,
      sendPhoneOtp,
      verifyPhoneOtp,
      updateProfile,
      refreshUser,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
