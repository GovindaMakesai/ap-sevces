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
const APP_RETURN_URL = Linking.createURL('oauth-complete');
const LOGIN_SUCCESS_PREFIX = `${FRONTEND_URL}/login-success.html`;
const MOBILE_INJECT_SCRIPT = getMobileDashboardInjectScript();

function extractToken(url) {
  if (!url) return '';
  try {
    const parsed = Linking.parse(url);
    const t = parsed?.queryParams?.token;
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

  const injectMobileLayout = useCallback(() => {
    webViewRef.current?.injectJavaScript(MOBILE_INJECT_SCRIPT);
  }, []);

  const finishLoginInWebView = useCallback((token) => {
    if (!token || token === handledTokenRef.current) return;
    if (!webViewRef.current || !webViewReadyRef.current) {
      pendingTokenRef.current = token;
      return;
    }

    handledTokenRef.current = token;
    pendingTokenRef.current = '';

    const successPath =
      '/login-success.html?token=' +
      encodeURIComponent(token) +
      '&source=expo-app';

    const script = `
      (function() {
        try {
          localStorage.setItem('token', ${JSON.stringify(token)});
          localStorage.removeItem('app_redirect');
        } catch (e) {}
        window.location.replace(${JSON.stringify(successPath)});
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

      const authUrl =
        `${API_BASE_URL}/auth/${provider}` +
        `?role=${encodeURIComponent(role)}` +
        `&app_redirect=${encodeURIComponent(APP_RETURN_URL)}`;

      try {
        const result = await WebBrowser.openAuthSessionAsync(
          authUrl,
          LOGIN_SUCCESS_PREFIX
        );

        if (result.type === 'success' && result.url) {
          const token = extractToken(result.url);
          if (token) {
            await applyOAuthToken(token);
            return;
          }
        }
      } catch (err) {
        console.warn('OAuth session failed', err);
      } finally {
        oauthBusyRef.current = false;
        try {
          await WebBrowser.dismissBrowser();
        } catch (_e) {
          /* ignore */
        }
      }
    },
    [applyOAuthToken]
  );

  useEffect(() => {
    const handleDeepLink = ({ url }) => {
      const token = extractToken(url);
      if (token) applyOAuthToken(token);
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
      if (token && url.includes('login-success')) {
        applyOAuthToken(token);
        return true;
      }

      if (url.startsWith('apservices://') || url.startsWith('exp://')) {
        if (token) applyOAuthToken(token);
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
      hostname === 'accounts.google.com' ||
      hostname.endsWith('.google.com') ||
      hostname === 'github.com' ||
      hostname.endsWith('.github.com') ||
      hostname === 'facebook.com' ||
      hostname.endsWith('.facebook.com') ||
      hostname === 'm.facebook.com';

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
        source={{ uri: launchUrl }}
        injectedJavaScript={MOBILE_INJECT_SCRIPT}
        onLoadEnd={() => {
          webViewReadyRef.current = true;
          injectMobileLayout();
          if (pendingTokenRef.current) {
            finishLoginInWebView(pendingTokenRef.current);
          }
        }}
        onNavigationStateChange={(nav) => {
          injectMobileLayout();
          const url = nav?.url || '';
          handleOAuthUrl(url);
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
});
