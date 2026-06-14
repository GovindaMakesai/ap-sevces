import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getMobileDashboardInjectScript } from './injectedMobileFix';

const apiConfig = require('./config/production-api');

WebBrowser.maybeCompleteAuthSession();

const PRODUCTION_WEB = apiConfig.USE_HTTPS_DOMAIN
  ? apiConfig.BACKEND_URL.replace(/\/$/, '')
  : 'https://ap-sevces.vercel.app';
const DEV_WEB_PORT = 5500;

/** Same LAN IP as the Expo QR code (e.g. 192.168.1.9). */
function getExpoLanHost() {
  const raw =
    Constants.expoConfig?.hostUri ||
    Constants.linkingUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost ||
    '';
  const s = String(raw);
  const m = s.match(/(?:\/\/|@)([\d.]+)/) || s.match(/^([\d.]+):/);
  const host = m?.[1];
  if (host && host !== '127.0.0.1' && host !== 'localhost') return host;
  return null;
}

function resolveFrontendBase() {
  if (process.env.EXPO_PUBLIC_WEB_URL) {
    return process.env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, '');
  }
  // LAN HTTP blocks camera/mic in Android WebView (getUserMedia needs HTTPS).
  // Opt into LAN UI dev with EXPO_PUBLIC_USE_LAN_WEB=1 (live host will not work).
  if (__DEV__ && process.env.EXPO_PUBLIC_USE_LAN_WEB === '1') {
    const lan = getExpoLanHost();
    if (lan) return `http://${lan}:${DEV_WEB_PORT}`;
  }
  return PRODUCTION_WEB;
}

const FRONTEND_BASE = resolveFrontendBase();
const IS_DEV_LOCAL =
  __DEV__ && (FRONTEND_BASE.includes(`:${DEV_WEB_PORT}`) || Boolean(process.env.EXPO_PUBLIC_WEB_URL));

/** App always opens Sign Up / Sign In first. Legacy skip: EXPO_PUBLIC_WEB_ENTRY=legacy */
const FRONTEND_URL =
  process.env.EXPO_PUBLIC_WEB_ENTRY === 'legacy'
    ? FRONTEND_BASE
    : `${FRONTEND_BASE}/app-auth.html`;

/** Native app uses Hostinger VPS API (cleartext allowed in app.json). */
const API_BASE_URL = apiConfig.API_URL;
/** Native: API + OAuth start on VPS. Callback URLs stay HTTPS (Vercel) in provider consoles. */
const AUTH_ORIGIN = apiConfig.BACKEND_URL.replace(/\/$/, '');
/** Deep link the system OAuth browser closes on (apservices:// or exp:// in Expo Go). */
const APP_RETURN_URL = Linking.createURL('oauth-complete');
/** Fallback when the API still redirects to the web login-success page first. */
const LOGIN_SUCCESS_PREFIX = `${FRONTEND_BASE}/login-success.html`;
const MOBILE_INJECT_SCRIPT = getMobileDashboardInjectScript();
/** Runs before page paint — marks every WebView page as native app shell */
const PRODUCTION_API = apiConfig.API_URL;
const APP_SHELL_BOOTSTRAP = `(function(){try{document.documentElement.classList.add('ap-expo-app','social-app','social-bridge-mode','social-native','auth-native');window.__AP_NATIVE_APP__=true;window.__AP_API_URL__='${PRODUCTION_API}';window.__AP_SOCKET_URL__='${apiConfig.BACKEND_URL}';window.__AP_OAUTH_RETURN__='${APP_RETURN_URL.replace(/'/g, "\\'")}';try{localStorage.setItem('app_redirect','${APP_RETURN_URL.replace(/'/g, "\\'")}');}catch(e){}document.documentElement.style.background='#faf6ee';if(document.body)document.body.style.background='#faf6ee';var s=document.getElementById('ap-native-critical');if(!s){s=document.createElement('style');s.id='ap-native-critical';s.textContent='html.ap-expo-app .navbar,html.ap-expo-app .footer{display:none!important}html.ap-expo-app .chat-tab.active{background:linear-gradient(135deg,#d4a84b,#9a7218)!important;color:#fff!important}html.ap-expo-app .message-wrapper.sent .message-content{background:linear-gradient(135deg,#d4a84b,#9a7218)!important}';(document.head||document.documentElement).appendChild(s);}}catch(e){}})();true;`;

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
  const raw = String(url);
  const qm = raw.match(/[?&]token=([^&#]+)/);
  if (qm?.[1]) return decodeURIComponent(qm[1]);
  const hash = raw.includes('#') ? raw.split('#')[1] : '';
  const hm = hash.match(/(?:^|&)token=([^&]+)/);
  return hm?.[1] ? decodeURIComponent(hm[1]) : '';
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
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    console.log('[ap-services-app] WebView base:', FRONTEND_BASE);
    console.log('[ap-services-app] OAuth return URL:', APP_RETURN_URL);
    console.log('[ap-services-app] Launch URL:', FRONTEND_URL);
    if (IS_DEV_LOCAL) {
      console.log(
        '[ap-services-app] Dev: run npm start from ap-services-app (serves frontend/ on port',
        DEV_WEB_PORT + ')'
      );
    }
  }, []);

  const launchUrl = useMemo(() => {
    const params = new URLSearchParams({
      app_redirect: APP_RETURN_URL,
      source: 'expo-app',
      app: '1',
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

    const tokenJson = JSON.stringify(token);
    const apiBase = JSON.stringify(API_BASE_URL);
    const successPage = JSON.stringify(
      `${FRONTEND_BASE}/login-success.html?token=${encodeURIComponent(token)}&source=expo-app&app=1`
    );

    const script = `
      (function() {
        var token = ${tokenJson};
        var api = ${apiBase};
        try {
          localStorage.setItem('token', token);
          localStorage.removeItem('app_redirect');
          if (window.AppState) window.AppState.token = token;
        } catch (e) {}
        function go(path) { window.location.replace(path); }
        fetch(api + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var user = data && data.success && data.data && data.data.user;
            if (!user) throw new Error('profile');
            try {
              localStorage.setItem('user', JSON.stringify(user));
              if (window.AppState) window.AppState.user = user;
            } catch (e) {}
            var path = '/explore.html?app=1';
            if (user.role === 'admin') path = '/admin-dashboard.html?app=1';
            else if (user.role === 'worker') path = '/worker-dashboard.html?app=1';
            go(path);
          })
          .catch(function() {
            go(${successPage});
          });
      })();
      true;
    `;

    if (!webViewRef.current) {
      pendingTokenRef.current = token;
      return;
    }

    handledTokenRef.current = token;
    pendingTokenRef.current = '';
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
    async (provider, role = 'customer', appRedirect = APP_RETURN_URL) => {
      if (oauthBusyRef.current) return;
      oauthBusyRef.current = true;
      handledTokenRef.current = '';

      const redirectTarget = appRedirect || APP_RETURN_URL;
      const authUrl =
        `${AUTH_ORIGIN}/auth/${provider}` +
        `?role=${encodeURIComponent(role)}` +
        `&app_redirect=${encodeURIComponent(redirectTarget)}`;

      try {
        if (Platform.OS === 'android') {
          try {
            await WebBrowser.warmUpAsync();
          } catch (_e) {
            /* optional */
          }
        }

        const returnUrls = [redirectTarget, APP_RETURN_URL].filter(
          (u, i, arr) => u && arr.indexOf(u) === i
        );

        let result = { type: 'cancel' };
        for (const returnUrl of returnUrls) {
          result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, {
            showInRecents: true,
            preferEphemeralSession: false,
          });
          if (result.type === 'success' && result.url) break;
        }

        console.log('[ap-services-app] OAuth result:', result.type, result.url || '');

        if (result.type === 'success' && result.url) {
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

      if (token && (isNativeOAuthReturnUrl(url) || url.includes('login-success'))) {
        if (handledTokenRef.current === token) return true;
        pendingTokenRef.current = token;
        applyOAuthToken(token);
        return true;
      }

      if (url.includes('login-success')) {
        return false;
      }

      const provider = parseAuthProvider(url);
      if (
        provider &&
        (url.includes('62.72.56.74') || url.includes('ap-sevces.onrender.com') || url.includes(AUTH_ORIGIN) || url.includes('/auth/'))
      ) {
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

  const onWebViewMessage = useCallback(
    (event) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'oauth' && data.provider) {
          const redirect =
            typeof data.appRedirect === 'string' && data.appRedirect
              ? data.appRedirect
              : APP_RETURN_URL;
          startOAuthInBrowser(data.provider, data.role || 'customer', redirect);
        }
      } catch (_e) {
        /* not our message */
      }
    },
    [startOAuthInBrowser]
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
      {loadError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorHint}>
            Stop Expo (Ctrl+C), then run: cd ap-services-app → npm start
          </Text>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        style={styles.webview}
        source={{ uri: launchUrl }}
        injectedJavaScriptBeforeContentLoaded={APP_SHELL_BOOTSTRAP}
        startInLoadingState={false}
        pullToRefreshEnabled={false}
        overScrollMode="never"
        bounces={true}
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mediaCapturePermissionGrantType="grant"
        mixedContentMode="always"
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
          setLoadError(
            `Cannot load ${FRONTEND_BASE}. Run "npm start" inside ap-services-app (starts frontend on :${DEV_WEB_PORT}).`
          );
        }}
        onHttpError={(e) => {
          const code = e?.nativeEvent?.statusCode;
          const url = e?.nativeEvent?.url || '';
          console.warn('WebView HTTP error', code, url);
          if (code === 404 && url.includes('explore.html')) {
            setLoadError(
              'explore.html not found. Use "npm start" in ap-services-app for local UI, or deploy frontend/ to Vercel.'
            );
          }
        }}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onMessage={onWebViewMessage}
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
  container: { flex: 1, backgroundColor: '#fdf9f0' },
  webview: { flex: 1, backgroundColor: '#fdf9f0' },
  errorBar: {
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    padding: 10,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  errorHint: { color: '#7f1d1d', fontSize: 11, marginTop: 4 },
});
