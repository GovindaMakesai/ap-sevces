import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getMobileDashboardInjectScript } from './injectedMobileFix';

WebBrowser.maybeCompleteAuthSession();

/** Production site. Override in `.env` with EXPO_PUBLIC_WEB_URL for local frontend testing. */
const FRONTEND_URL =
  (process.env.EXPO_PUBLIC_WEB_URL || 'https://ap-sevces.vercel.app').replace(/\/$/, '');
const API_BASE_URL = 'https://ap-sevces.onrender.com';
/** Deep link the system OAuth browser closes on (apservices:// or exp:// in Expo Go). */
const APP_RETURN_URL = Linking.createURL('oauth-complete');
/** Fallback when the API still redirects to the web login-success page first. */
const LOGIN_SUCCESS_PREFIX = `${FRONTEND_URL}/login-success.html`;
const MOBILE_INJECT_SCRIPT = getMobileDashboardInjectScript();

function isNativeOAuthReturnUrl(url) {
  if (!url) return false;
  const u = String(url);
  return u.startsWith('apservices://') || u.startsWith('exp://');
}

function extractToken(url) {
  if (!url) return '';
  try {
    const parsed = Linking.parse(url);
    const t = parsed?.queryParams?.token;
    if (Array.isArray(t) && t[0]) return String(t[0]);
    if (typeof t === 'string' && t) return t;
  } catch (_e) {
    /* fall through */
  }
  const m = String(url).match(/[?&]token=([^&#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : '';
}

function parseAuthProvider(url) {
  const m = String(url).match(/\/auth\/(google|github|facebook)(?:\?|$|\/)/i);
  return m?.[1]?.toLowerCase() || '';
}

export default function App() {
  const webViewRef = useRef(null);
  const pendingTokenRef = useRef('');
  const webViewReadyRef = useRef(false);
  const handledTokenRef = useRef('');
  const oauthBusyRef = useRef(false);

  const launchUrl = useMemo(() => {
    const params = new URLSearchParams({
      app_redirect: APP_RETURN_URL,
      source: 'expo-app',
      v: String(Date.now()),
    });
    const sep = FRONTEND_URL.includes('?') ? '&' : '?';
    return `${FRONTEND_URL}${sep}${params.toString()}`;
  }, []);

  const lastInjectedUrlRef = useRef('');

  const injectMobileLayout = useCallback((pageUrl) => {
    if (!webViewRef.current) return;
    const url = pageUrl || '';
    if (url && url === lastInjectedUrlRef.current) return;
    if (url) lastInjectedUrlRef.current = url;
    // Defer so DOM is ready; avoids white screen from early inject crashes.
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(MOBILE_INJECT_SCRIPT);
    }, 250);
  }, []);

  const finishLoginInWebView = useCallback((token) => {
    if (!token) return;
    if (!webViewRef.current || !webViewReadyRef.current) {
      pendingTokenRef.current = token;
      return;
    }

    handledTokenRef.current = token;
    pendingTokenRef.current = '';

    const tokenJson = JSON.stringify(token);
    const apiBase = JSON.stringify(`${API_BASE_URL}/api`);
    const fallbackSuccess = JSON.stringify(
      `${FRONTEND_URL}/login-success.html?token=${encodeURIComponent(token)}&source=expo-app`
    );

    const script = `
      (function() {
        try {
          localStorage.setItem('token', ${tokenJson});
          localStorage.removeItem('app_redirect');
        } catch (e) {}
        var api = ${apiBase};
        fetch(api + '/auth/me', {
          headers: { Authorization: 'Bearer ' + ${tokenJson} }
        })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (!data || !data.success || !data.data || !data.data.user) {
              throw new Error((data && data.message) || 'Profile load failed');
            }
            var user = data.data.user;
            try {
              localStorage.setItem('user', JSON.stringify(user));
              if (window.AppState) {
                window.AppState.token = ${tokenJson};
                window.AppState.user = user;
              }
            } catch (e) {}
            var path = '/customer-dashboard.html';
            if (user.role === 'admin') path = '/admin-dashboard.html';
            else if (user.role === 'worker') path = '/worker-dashboard.html';
            window.location.replace(path);
          })
          .catch(function(err) {
            console.warn('[ap-expo] auth/me failed, using login-success fallback', err);
            window.location.replace(${fallbackSuccess});
          });
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  }, []);

  const applyOAuthToken = useCallback(
    async (token) => {
      if (!token) return;
      try {
        await WebBrowser.dismissBrowser();
      } catch (_e) {
        /* already closed */
      }
      finishLoginInWebView(token);
    },
    [finishLoginInWebView]
  );

  const startOAuthInBrowser = useCallback(
    async (provider, role = 'customer') => {
      if (oauthBusyRef.current) return;
      oauthBusyRef.current = true;
      handledTokenRef.current = '';

      const authUrl =
        `${API_BASE_URL}/auth/${provider}` +
        `?role=${encodeURIComponent(role)}` +
        `&app_redirect=${encodeURIComponent(APP_RETURN_URL)}`;

      try {
        if (Platform.OS === 'android') {
          try {
            await WebBrowser.warmUpAsync();
          } catch (_e) {
            /* optional */
          }
        }

        const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN_URL, {
          showInRecents: true,
          preferEphemeralSession: false,
        });

        if (result.type === 'success' && result.url) {
          const token = extractToken(result.url);
          if (token) {
            await applyOAuthToken(token);
            return;
          }
        }

        // HTTPS login-success fallback (before API deploy) or Android dismiss quirk
        if (result.type === 'success' && result.url?.includes('login-success')) {
          const token = extractToken(result.url);
          if (token) {
            await applyOAuthToken(token);
            return;
          }
        }

        if (pendingTokenRef.current) {
          await applyOAuthToken(pendingTokenRef.current);
        }
      } catch (err) {
        console.warn('OAuth session failed', err);
        if (pendingTokenRef.current) {
          await applyOAuthToken(pendingTokenRef.current);
        }
      } finally {
        oauthBusyRef.current = false;
        try {
          await WebBrowser.dismissBrowser();
        } catch (_e) {
          /* ignore */
        }
        if (Platform.OS === 'android') {
          try {
            await WebBrowser.coolDownAsync();
          } catch (_e) {
            /* optional */
          }
        }
      }
    },
    [applyOAuthToken]
  );

  useEffect(() => {
    const handleDeepLink = ({ url }) => {
      if (!isNativeOAuthReturnUrl(url)) return;
      const token = extractToken(url);
      if (!token) return;
      pendingTokenRef.current = token;
      applyOAuthToken(token);
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL()
      .then((initialUrl) => {
        if (initialUrl) handleDeepLink({ url: initialUrl });
      })
      .catch(() => {});

    return () => subscription.remove();
  }, [applyOAuthToken]);

  const handleOAuthUrl = useCallback(
    (url) => {
      const token = extractToken(url);

      // Only native deep links — let login-success.html load normally in the WebView.
      if (token && isNativeOAuthReturnUrl(url)) {
        pendingTokenRef.current = token;
        applyOAuthToken(token);
        return true;
      }

      const provider = parseAuthProvider(url);
      if (provider && url.includes(API_BASE_URL)) {
        let role = 'customer';
        try {
          role = new URL(url).searchParams.get('role') || 'customer';
        } catch (_e) {
          /* ignore */
        }
        startOAuthInBrowser(provider, role);
        return true;
      }

      return false;
    },
    [applyOAuthToken, startOAuthInBrowser]
  );

  const onShouldStartLoadWithRequest = (request) => {
    const url = request?.url || '';
    if (handleOAuthUrl(url)) return false;

    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch (_e) {
      hostname = '';
    }

    const shouldOpenExternal =
      !oauthBusyRef.current &&
      (hostname === 'accounts.google.com' ||
        hostname.endsWith('.google.com') ||
        hostname === 'github.com' ||
        hostname.endsWith('.github.com') ||
        hostname === 'facebook.com' ||
        hostname.endsWith('.facebook.com') ||
        hostname === 'm.facebook.com');

    if (shouldOpenExternal) {
      Linking.openURL(url).catch(() => {});
      return false;
    }

    return true;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        style={styles.webview}
        source={{ uri: launchUrl }}
        startInLoadingState
        onLoadStart={() => {
          lastInjectedUrlRef.current = '';
        }}
        onLoadEnd={(e) => {
          webViewReadyRef.current = true;
          const url = e?.nativeEvent?.url || '';
          injectMobileLayout(url);
          if (pendingTokenRef.current) {
            finishLoginInWebView(pendingTokenRef.current);
          }
        }}
        onNavigationStateChange={(nav) => {
          const url = nav?.url || '';
          if (handleOAuthUrl(url)) {
            webViewRef.current?.stopLoading();
          }
        }}
        onError={(e) => {
          console.warn('WebView error', e?.nativeEvent);
        }}
        onHttpError={(e) => {
          console.warn('WebView HTTP error', e?.nativeEvent?.statusCode, e?.nativeEvent?.url);
        }}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        cacheMode={Platform.OS === 'android' ? 'LOAD_NO_CACHE' : undefined}
        sharedCookiesEnabled
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  webview: { flex: 1, backgroundColor: '#ffffff' },
});
