import {
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
  Share,
} from 'react-native';
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
  const expReturn = String(Linking.createURL('oauth-complete') || '');
  const expMatch = expReturn.match(/^exp:\/\/([\d.]+):/);
  if (expMatch?.[1] && expMatch[1] !== '127.0.0.1') return expMatch[1];
  return null;
}

function resolveFrontendBase() {
  if (process.env.EXPO_PUBLIC_WEB_URL) {
    return process.env.EXPO_PUBLIC_WEB_URL.replace(/\/$/, '');
  }
  // LAN HTTP blocks camera/mic in Android WebView (getUserMedia needs HTTPS).
  // Opt in with EXPO_PUBLIC_USE_LAN_WEB=1 via npm run start:lan
  if (__DEV__ && String(process.env.EXPO_PUBLIC_USE_LAN_WEB) === '1') {
    const lan = getExpoLanHost();
    if (lan) return `http://${lan}:${DEV_WEB_PORT}`;
  }
  return PRODUCTION_WEB;
}

function isDevLocalBase(base) {
  return __DEV__ && (base.includes(`:${DEV_WEB_PORT}`) || Boolean(process.env.EXPO_PUBLIC_WEB_URL));
}

function buildFrontendUrl(base) {
  return process.env.EXPO_PUBLIC_WEB_ENTRY === 'legacy'
    ? base
    : `${base}/app-auth.html`;
}

/** Native app uses Hostinger VPS API (cleartext allowed in app.json). */
const API_BASE_URL = apiConfig.API_URL;
/** Native: API + OAuth start on VPS. Callback URLs stay HTTPS (Vercel) in provider consoles. */
const AUTH_ORIGIN = apiConfig.BACKEND_URL.replace(/\/$/, '');
/** Deep link the system OAuth browser closes on (apservices:// or exp:// in Expo Go). */
const APP_RETURN_URL = Linking.createURL('oauth-complete');
const MOBILE_INJECT_SCRIPT = getMobileDashboardInjectScript();
const STATUS_BAR_INSET =
  Platform.OS === 'android'
    ? RNStatusBar.currentHeight || Constants.statusBarHeight || 28
    : Constants.statusBarHeight || 28;
/** Runs before page paint — native shell + blocks legacy login redirect loop */
const PRODUCTION_API = apiConfig.API_URL;

function buildAppShellBootstrap(frontendBase) {
  const isDevLocal = isDevLocalBase(frontendBase);
  const injectedApi = isDevLocal ? `${frontendBase}/api` : PRODUCTION_API;
  const injectedSocket = isDevLocal ? frontendBase : apiConfig.BACKEND_URL;
  return `(function(){try{document.documentElement.classList.add('ap-expo-app','social-app','social-bridge-mode','social-native','auth-native');document.documentElement.style.setProperty('--ap-expo-safe-top','0px');window.__AP_NATIVE_APP__=true;window.__AP_API_URL__='${injectedApi}';window.__AP_SOCKET_URL__='${injectedSocket}';window.__AP_OAUTH_RETURN__='${APP_RETURN_URL.replace(/'/g, "\\'")}';try{localStorage.setItem('app_redirect','${APP_RETURN_URL.replace(/'/g, "\\'")}');}catch(e){}document.documentElement.style.background='#faf6ee';if(document.body)document.body.style.background='#faf6ee';var s=document.getElementById('ap-native-critical');if(!s){s=document.createElement('style');s.id='ap-native-critical';s.textContent='html.ap-expo-app .chat-tab.active{background:linear-gradient(135deg,#d4a84b,#9a7218)!important;color:#fff!important}html.ap-expo-app .message-wrapper.sent .message-content{background:linear-gradient(135deg,#d4a84b,#9a7218)!important}';(document.head||document.documentElement).appendChild(s);}function apHasSession(){try{return!!(localStorage.getItem('user')||localStorage.getItem('token')||(document.cookie&&document.cookie.indexOf('ap_access')!==-1));}catch(e){return false;}}window.__AP_HAS_NATIVE_SESSION__=apHasSession;var _r=window.location.replace.bind(window.location);window.location.replace=function(u){if(u&&String(u).indexOf('app-auth')!==-1&&apHasSession())return;return _r(u);};var _rm=localStorage.removeItem.bind(localStorage);localStorage.removeItem=function(k){if(k==='user'&&document.cookie&&document.cookie.indexOf('ap_access')!==-1)return;return _rm(k);};}catch(e){}})();true;`;
}

function switchToProductionFrontend(setFrontendBase, setLanFallbackDone, setLoadError) {
  console.warn('[ap-services-app] LAN unreachable — switching to production HTTPS');
  setLanFallbackDone(true);
  setFrontendBase(PRODUCTION_WEB);
  setLoadError('');
}

function isNativeOAuthReturnUrl(url) {
  if (!url) return false;
  const u = String(url);
  return u.startsWith('apservices://') || u.startsWith('exp://');
}

/** @returns {{ type: 'code' | 'token', value: string } | null} */
function extractOAuthCredential(url) {
  if (!url) return null;
  const raw = String(url);

  const readParam = (name) => {
    try {
      const parsed = Linking.parse(url);
      const v = parsed?.queryParams?.[name];
      if (Array.isArray(v) && v[0]) return String(v[0]);
      if (typeof v === 'string' && v) return v;
    } catch (_e) {
      /* fall through */
    }
    const m = raw.match(new RegExp(`[?&]${name}=([^&#]+)`));
    return m?.[1] ? decodeURIComponent(m[1]) : '';
  };

  const code = readParam('code');
  if (code) return { type: 'code', value: code };

  const token = readParam('token');
  if (token) return { type: 'token', value: token };

  return null;
}

function waitForPendingCredential(pendingRef, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (pendingRef.current?.value) {
      resolve(pendingRef.current);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (pendingRef.current?.value) {
        clearInterval(timer);
        resolve(pendingRef.current);
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 120);
  });
}

function parseAuthProvider(url) {
  const m = String(url).match(/\/auth\/(google|github|facebook)(?:\?|$|\/)/i);
  return m?.[1]?.toLowerCase() || '';
}

function dashboardUrlForUser(user, frontendBase) {
  const q = '?app=1&source=expo-app';
  if (user?.role === 'admin') return `${frontendBase}/admin-dashboard.html${q}`;
  if (user?.role === 'worker') return `${frontendBase}/worker-dashboard.html${q}`;
  return `${frontendBase}/explore.html${q}`;
}

function buildSessionInjectScript(user, accessToken) {
  const userJson = JSON.stringify(user);
  let script = `(function(){try{localStorage.setItem('user',${JSON.stringify(userJson)});`;
  if (accessToken) {
    script += `localStorage.setItem('token',${JSON.stringify(String(accessToken))});`;
  } else {
    script += `localStorage.removeItem('token');`;
  }
  script += `if(window.AppState){try{AppState.user=JSON.parse(${JSON.stringify(userJson)});}catch(e){}}`;
  script += `window.__AP_LOGGED_IN__=true;}catch(e){}})();`;
  return script;
}

function buildNavigateScript(user, accessToken, dest) {
  return (
    buildSessionInjectScript(user, accessToken) +
    `window.location.replace(${JSON.stringify(dest)}); true;`
  );
}

export default function App() {
  const webViewRef = useRef(null);
  const pendingTokenRef = useRef(null);
  const webViewReadyRef = useRef(false);
  const handledTokenRef = useRef('');
  const processingCredRef = useRef('');
  const oauthBusyRef = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [sessionInject, setSessionInject] = useState('');
  const [frontendBase, setFrontendBase] = useState(() => resolveFrontendBase());
  const [lanFallbackDone, setLanFallbackDone] = useState(false);
  const nativeSessionRef = useRef(null);
  const oauthCompleteRef = useRef(false);
  /** WebView source is set once — post-login navigation uses injectJavaScript only */
  const webSourceUriRef = useRef('');

  const isDevLocal = useMemo(() => isDevLocalBase(frontendBase), [frontendBase]);
  const frontendUrl = useMemo(() => buildFrontendUrl(frontendBase), [frontendBase]);
  const appShellBootstrap = useMemo(() => buildAppShellBootstrap(frontendBase), [frontendBase]);

  useEffect(() => {
    console.log('[ap-services-app] WebView base:', frontendBase);
    console.log('[ap-services-app] OAuth return URL:', APP_RETURN_URL);
    console.log('[ap-services-app] Mode:', isDevLocal ? 'LAN dev' : 'LIVE (HTTPS)');
    if (isDevLocal) {
      console.log('[ap-services-app] LAN dev — phone must be on same Wi-Fi; use npm start for live HTTPS');
    }
  }, [frontendBase, isDevLocal]);

  useEffect(() => {
    webViewReadyRef.current = false;
    const timer = setTimeout(() => {
      if (webViewReadyRef.current) return;
      if (isDevLocal && !lanFallbackDone) {
        switchToProductionFrontend(setFrontendBase, setLanFallbackDone, setLoadError);
        return;
      }
      setLoadError(
        isDevLocal
          ? `Cannot reach ${frontendBase}. Use npm start (live mode) or npm run start:lan with phone on same Wi-Fi.`
          : `Cannot load ${frontendBase}. Check your internet — if the server was just restarted, wait 60s and reload.`
      );
    }, 20000);
    return () => clearTimeout(timer);
  }, [frontendBase, isDevLocal, lanFallbackDone]);

  const launchUrl = useMemo(() => {
    const params = new URLSearchParams({
      app_redirect: APP_RETURN_URL,
      source: 'expo-app',
      app: '1',
    });
    const sep = frontendUrl.includes('?') ? '&' : '?';
    return `${frontendUrl}${sep}${params.toString()}`;
  }, [frontendUrl]);

  if (!webSourceUriRef.current) {
    webSourceUriRef.current = launchUrl;
  }

  useEffect(() => {
    console.log('[ap-services-app] Launch URL:', webSourceUriRef.current);
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

  const finishLoginInWebView = useCallback(
    async (credential) => {
      if (!credential?.value) return;

      const credKey = `${credential.type}:${credential.value}`;
      if (handledTokenRef.current === credKey) return;
      if (processingCredRef.current === credKey) return;

      processingCredRef.current = credKey;
      pendingTokenRef.current = null;

      console.log('[ap-services-app] Exchanging OAuth', credential.type, 'via API');

      try {
        let user = null;
        let accessToken = null;

        if (credential.type === 'code') {
          const res = await fetch(`${API_BASE_URL}/auth/exchange-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: credential.value }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success || !data.data?.user) {
            throw new Error(data.message || 'OAuth exchange failed');
          }
          user = data.data.user;
          accessToken = data.data.accessToken || null;
        } else if (credential.type === 'token') {
          accessToken = credential.value;
          const res = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${credential.value}` },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success || !data.data?.user) {
            throw new Error(data.message || 'Token validation failed');
          }
          user = data.data.user;
        } else {
          throw new Error('Unsupported OAuth credential');
        }

        const dest = dashboardUrlForUser(user, frontendBase);
        nativeSessionRef.current = { user, accessToken };
        oauthCompleteRef.current = true;
        handledTokenRef.current = credKey;
        setLoadError('');
        const sessionScript = buildSessionInjectScript(user, accessToken);
        setSessionInject(sessionScript);

        console.log('[ap-services-app] Login OK — opening', dest);
        if (!accessToken) {
          console.warn('[ap-services-app] No accessToken from API — modules may show session expired until VPS is updated');
        }

        const goScript = buildNavigateScript(user, accessToken, dest);
        const tryGo = () => webViewRef.current?.injectJavaScript(goScript);
        tryGo();
        setTimeout(tryGo, 150);
        setTimeout(tryGo, 500);
      } catch (err) {
        console.warn('[ap-services-app] Login exchange failed', err);
        setLoadError(err.message || 'Sign in failed. Try Google again.');
      } finally {
        if (processingCredRef.current === credKey) processingCredRef.current = '';
      }
    },
    [frontendBase]
  );

  const applyOAuthCredential = useCallback(
    async (credential) => {
      if (!credential?.value) return;
      const credKey = `${credential.type}:${credential.value}`;
      if (handledTokenRef.current === credKey) return;
      if (processingCredRef.current === credKey) return;
      console.log('[ap-services-app] Completing login via', credential.type);
      try {
        await WebBrowser.dismissBrowser();
      } catch (_e) {
        /* already closed */
      }
      await finishLoginInWebView(credential);
    },
    [finishLoginInWebView]
  );

  const startOAuthInBrowser = useCallback(
    async (provider, role = 'customer', appRedirect = APP_RETURN_URL) => {
      if (oauthBusyRef.current) return;
      oauthBusyRef.current = true;

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

        let credential =
          result.type === 'success' && result.url ? extractOAuthCredential(result.url) : null;

        if (!credential) {
          credential = await waitForPendingCredential(pendingTokenRef);
        }

        if (credential) {
          await applyOAuthCredential(credential);
          return;
        }
      } catch (err) {
        console.warn('OAuth session failed', err);
        const credential = await waitForPendingCredential(pendingTokenRef, 1500);
        if (credential) {
          await applyOAuthCredential(credential);
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
    [applyOAuthCredential]
  );

  useEffect(() => {
    const handleDeepLink = ({ url }) => {
      if (!isNativeOAuthReturnUrl(url)) return;
      if (oauthCompleteRef.current) return;
      const credential = extractOAuthCredential(url);
      if (!credential) return;
      const credKey = `${credential.type}:${credential.value}`;
      if (handledTokenRef.current === credKey) return;
      pendingTokenRef.current = credential;
      applyOAuthCredential(credential);
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    // Do not call getInitialURL — it replays stale OAuth codes on every Metro reload and breaks login.

    return () => subscription.remove();
  }, [applyOAuthCredential]);

  const handleOAuthUrl = useCallback(
    (url) => {
      const credential = extractOAuthCredential(url);

      if (credential && (isNativeOAuthReturnUrl(url) || url.includes('login-success'))) {
        const credKey = `${credential.type}:${credential.value}`;
        if (handledTokenRef.current === credKey) return true;
        pendingTokenRef.current = credential;
        applyOAuthCredential(credential);
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
    [applyOAuthCredential, startOAuthInBrowser]
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
          return;
        }
        if (data.type === 'login' && data.user) {
          const dest = dashboardUrlForUser(data.user, frontendBase);
          nativeSessionRef.current = {
            user: data.user,
            accessToken: data.accessToken || null,
          };
          oauthCompleteRef.current = true;
          setSessionInject(buildSessionInjectScript(data.user, data.accessToken || null));
          webViewRef.current?.injectJavaScript(
            buildNavigateScript(data.user, data.accessToken || null, dest)
          );
          return;
        }
        if (data.type === 'share') {
          const url = String(data.url || '');
          const title = String(data.title || 'AP Services');
          const text = String(data.text || 'Join me on AP Services');
          Share.share(
            Platform.OS === 'ios'
              ? { title, message: text, url }
              : { title, message: url ? `${text}\n${url}` : text }
          ).catch(() => {});
        }
      } catch (_e) {
        /* not our message */
      }
    },
    [startOAuthInBrowser, frontendBase]
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

  const webUri = webSourceUriRef.current;
  const persistedInject = nativeSessionRef.current
    ? buildSessionInjectScript(nativeSessionRef.current.user, nativeSessionRef.current.accessToken)
    : '';
  const injectedBootstrap = appShellBootstrap + persistedInject + sessionInject;

  const recoverSessionIfStuckOnAuth = useCallback(
    (pageUrl) => {
      if (!nativeSessionRef.current || !oauthCompleteRef.current) return;
      if (!pageUrl || !pageUrl.includes('app-auth')) return;
      const { user, accessToken } = nativeSessionRef.current;
      const dest = dashboardUrlForUser(user, frontendBase);
      webViewRef.current?.injectJavaScript(buildNavigateScript(user, accessToken, dest));
    },
    [frontendBase]
  );

  const tryLanFallback = useCallback(() => {
    if (!lanFallbackDone && isDevLocal) {
      switchToProductionFrontend(setFrontendBase, setLanFallbackDone, setLoadError);
      return true;
    }
    return false;
  }, [isDevLocal, lanFallbackDone]);

  return (
    <View style={[styles.container, { paddingTop: STATUS_BAR_INSET }]}>
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
        key={frontendBase}
        ref={webViewRef}
        style={styles.webview}
        source={{ uri: webUri }}
        injectedJavaScriptBeforeContentLoaded={injectedBootstrap}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#c9a227" />
            <Text style={styles.loadingText}>Loading AP Services…</Text>
          </View>
        )}
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
          recoverSessionIfStuckOnAuth(url);
          injectMobileLayout(url);
        }}
        onNavigationStateChange={(nav) => {
          const url = nav?.url || '';
          if (url.includes('explore.html') || url.includes('dashboard')) {
            oauthCompleteRef.current = true;
            setLoadError('');
          }
          if (url.includes('app-auth')) {
            recoverSessionIfStuckOnAuth(url);
          }
          if (handleOAuthUrl(url)) {
            webViewRef.current?.stopLoading();
          }
        }}
        onError={(e) => {
          console.warn('WebView error', e?.nativeEvent);
          if (tryLanFallback()) return;
          setLoadError(
            isDevLocal
              ? `Cannot load ${frontendBase}. Run npm run start:lan and keep phone on same Wi-Fi as your PC.`
              : `Cannot load ${frontendBase}. Check internet connection, then reload the app.`
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
        thirdPartyCookiesEnabled
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdf9f0' },
  webview: { flex: 1, backgroundColor: '#fdf9f0' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fdf9f0',
  },
  loadingText: { marginTop: 12, color: '#8b6914', fontSize: 14 },
  errorBar: {
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    padding: 10,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  errorHint: { color: '#7f1d1d', fontSize: 11, marginTop: 4 },
});
