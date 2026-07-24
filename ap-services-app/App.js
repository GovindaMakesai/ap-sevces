import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  PermissionsAndroid,
  Platform,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
  Share,
  ToastAndroid,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as ScreenCapture from 'expo-screen-capture';
import { getMobileDashboardInjectScript } from './injectedMobileFix';
import LiveAudioRoute from './liveAudioRoute';

const BRAND_LOGO = require('./assets/logo-loading.png');

/** @deprecated Prefer LiveAudioRoute — kept as thin compat for older web posts. */
async function forceSpeakerAudioMode(opts = {}) {
  const recording = opts.recording === true;
  if (recording) {
    await LiveAudioRoute.enterTalk({
      bluetoothSafe: opts.bluetoothSafe !== false,
      reason: 'compat_force_speaker',
    });
  } else {
    await LiveAudioRoute.enterPlayback('compat_force_speaker_playback');
  }
}

const apiConfig = require('./config/production-api');

WebBrowser.maybeCompleteAuthSession();

const PRODUCTION_WEB = apiConfig.USE_HTTPS_DOMAIN
  ? apiConfig.BACKEND_URL.replace(/\/$/, '')
  : 'https://ap-sevces.vercel.app';
const DEV_WEB_PORT = 5500;

const LIVE_SECURE_KEY = 'ap-live-secure';

function isLiveCaptureUrl(url) {
  const u = String(url || '');
  if (/live-room\.html|party-room\.html|\/live-room(?:\?|#|$)|\/party-room(?:\?|#|$)/i.test(u)) {
    return true;
  }
  /* Hash / query routes used by some shells */
  if (/[?#].*(?:live-room|party-room)/i.test(u)) return true;
  return false;
}

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
  if (process.env.EXPO_PUBLIC_WEB_ENTRY === 'legacy') return base;
  if (process.env.EXPO_PUBLIC_WEB_ENTRY === 'auth') return `${base}/app-auth.html`;
  // Logged-in users land on explore; logged-out users redirect to app-auth before paint.
  return `${base}/explore.html`;
}

/** Native app uses Hostinger VPS API (cleartext allowed in app.json). */
const API_BASE_URL = apiConfig.API_URL;
/** Native: API + OAuth start on VPS. Callback URLs stay HTTPS (Vercel) in provider consoles. */
const AUTH_ORIGIN = apiConfig.BACKEND_URL.replace(/\/$/, '');
/** Deep link the system OAuth browser closes on (apservices:// or exp:// in Expo Go). */
const APP_RETURN_URL = Linking.createURL('oauth-complete');
const MOBILE_INJECT_SCRIPT = getMobileDashboardInjectScript();
const APP_WEB_BUILD = '20260624-prod-audit';
const STATUS_BAR_INSET =
  Platform.OS === 'android'
    ? RNStatusBar.currentHeight || Constants.statusBarHeight || 28
    : Constants.statusBarHeight || 28;
/** Runs before page paint — native shell + blocks legacy login redirect loop */
const PRODUCTION_API = apiConfig.API_URL;
const LAN_DEV_LOCKED = __DEV__ && String(process.env.EXPO_PUBLIC_USE_LAN_WEB) === '1';
const IS_STANDALONE_APP = Constants.appOwnership === 'standalone';
const LOAD_TIMEOUT_MS = isDevLocalBase(resolveFrontendBase()) ? 20000 : 45000;

const LIVE_APP_FOREGROUND_INJECT = `(function(){
  try { window.LiveSession && window.LiveSession.onAppForeground && window.LiveSession.onAppForeground(); } catch(e) {}
  try { window.SocialLive && window.SocialLive.forceRemoteAudio && window.SocialLive.forceRemoteAudio('native-foreground'); } catch(e) {}
  try { window.APLive && window.APLive.forceRemoteAudio && window.APLive.forceRemoteAudio('native-foreground'); } catch(e) {}
})();true;`;

const LIVE_APP_BACKGROUND_INJECT = `(function(){
  try { window.LiveSession && window.LiveSession.onAppBackground && window.LiveSession.onAppBackground(); } catch(e) {}
})();true;`;

const LIVE_MINIMIZE_INJECT = `(function(){
  try {
    function ack(){ try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'hardware_back_handled'}));}catch(_e){} }
    var p=(location.pathname||'').toLowerCase();
    var isLive=/live-room\\.html|party-room\\.html/i.test(p)||!!(document.body&&document.body.dataset&&document.body.dataset.livePage);
    var hasMin=window.LiveSession&&window.LiveSession.isMinimized&&window.LiveSession.isMinimized();
    if(!isLive&&!hasMin) return;
    if(window.LiveSession&&window.LiveSession.onAndroidBack&&window.LiveSession.onAndroidBack()){ack();return;}
    if(window.APLive&&window.APLive.handleBack){window.APLive.handleBack();ack();return;}
    if(window.SocialLive&&window.SocialLive.handleBack){window.SocialLive.handleBack();ack();return;}
    if(window.LiveSession&&window.LiveSession.handleBack&&window.LiveSession.handleBack()){ack();return;}
    if(window.LiveSession&&window.LiveSession.minimize&&window.LiveSession.minimize('/explore.html?app=1&source=expo-app')){ack();return;}
    ack();
  } catch(e) {
    try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'hardware_back_handled'}));}catch(_e){}
  }
})();true;`;

const HARDWARE_BACK_INJECT = `(function(){
  var handled = false;
  try {
    var p = (location.pathname || '').toLowerCase();
    var onExplore = /explore\\.html/i.test(p);
    var isLive = /live-room\\.html|party-room\\.html/i.test(p) || !!(document.body && document.body.dataset && document.body.dataset.livePage);
    function closeLiveUi() {
      var openSheet = document.querySelector('.party-tools-sheet.open, .gift-sheet.open, .party-requests-sheet.open, .social-broadcast-sheet-wrap.is-open, .ap-modal-overlay.is-open, .social-broadcast-overlay.is-open');
      if (openSheet) {
        openSheet.classList.remove('open', 'is-open', 'is-visible');
        document.body.classList.remove('ap-live-overlay-open', 'ap-chat-open', 'party-requests-open');
        return true;
      }
      var emoji = document.getElementById('apEmojiPopover');
      if (emoji && emoji.classList.contains('is-open')) {
        emoji.classList.remove('is-open');
        return true;
      }
      return false;
    }
    function minimizeLive() {
      if (window.LiveSession && window.LiveSession.onAndroidBack) {
        window.LiveSession.onAndroidBack();
        return true;
      }
      if (window.LiveSession && window.LiveSession.isMinimized && window.LiveSession.isMinimized()) return true;
      if (window.LiveSession && window.LiveSession.minimize) {
        window.LiveSession.minimize('/explore.html?app=1&source=expo-app');
        return true;
      }
      var live = window.APLive || window.SocialLive;
      if (live && typeof live.minimizeRoom === 'function') {
        live.minimizeRoom();
        return true;
      }
      if (live && typeof live.leaveToExplore === 'function') {
        live.leaveToExplore({ minimize: true });
        return true;
      }
      return true;
    }
    if (window.LiveSession && window.LiveSession.onAndroidBack && window.LiveSession.onAndroidBack()) {
      handled = true;
    } else if (window.LiveSession && window.LiveSession.handleBack && window.LiveSession.handleBack()) {
      handled = true;
    } else if (window.APLive && window.APLive.handleBack) {
      window.APLive.handleBack();
      handled = true;
    } else if (window.SocialLive && window.SocialLive.handleBack) {
      window.SocialLive.handleBack();
      handled = true;
    } else if (isLive) {
      if (closeLiveUi()) handled = true;
      else handled = minimizeLive();
    } else if (window.SocialNav && window.SocialNav.handleHardwareBack) {
      handled = !!window.SocialNav.handleHardwareBack();
    } else if (!onExplore) {
      /* Never WebView-history-back to login/blank — always stay in-app */
      location.href='/explore.html?app=1&source=expo-app';
      handled = true;
    }
  } catch(e) {}
  if (!handled) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type:'back_result',
      handled:false,
      route:location.pathname||'',
      search:location.search||'',
      onExplore:/explore\\.html/i.test((location.pathname||'').toLowerCase())
    }));
  }
})();true;`;

const MINIMIZE_LIVE_INJECT = LIVE_MINIMIZE_INJECT;

async function requestAndroidMediaPermissions(opts = {}) {
  if (Platform.OS !== 'android') return { ok: true, platform: Platform.OS };
  try {
    const wantMic = opts.microphone !== false;
    const perms = [PermissionsAndroid.PERMISSIONS.CAMERA];
    if (wantMic) perms.push(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    const results = await PermissionsAndroid.requestMultiple(perms);
    const camera = results[PermissionsAndroid.PERMISSIONS.CAMERA];
    const microphone = wantMic
      ? results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
      : PermissionsAndroid.RESULTS.GRANTED;
    const cameraOk =
      camera === PermissionsAndroid.RESULTS.GRANTED ||
      camera === PermissionsAndroid.RESULTS.LIMITED;
    const micOk = wantMic
      ? microphone === PermissionsAndroid.RESULTS.GRANTED
      : true;
    return {
      ok: cameraOk && micOk,
      camera,
      microphone: wantMic ? microphone : 'skipped',
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function buildMediaPermissionResultScript(result) {
  const payload = JSON.stringify(result ?? { ok: false });
  return `(function(){try{document.dispatchEvent(new CustomEvent('ap-media-permissions',{detail:${payload}}));}catch(e){}})();true;`;
}

function loadErrorHint(isDevLocal, frontendBase) {
  if (__DEV__ && isDevLocal) {
    return 'Same Wi-Fi as PC? Run: cd ap-services-app → npm run start:lan. Live camera/mic needs npm start (HTTPS).';
  }
  if (__DEV__) {
    return 'Stop Expo (Ctrl+C), then run: cd ap-services-app → npm start';
  }
  return 'Check your internet connection, then reload the app.';
}

function shouldShowLoadErrorHint(loadError) {
  if (!loadError) return false;
  return !/deactivat/i.test(String(loadError));
}

function redirectDeactivatedInWebView(message) {
  const msg = JSON.stringify(message || 'Your account has been deactivated');
  return (
    buildClearSessionScript() +
    `try{sessionStorage.setItem('ap_account_deactivated',${msg});}catch(e){};` +
    `window.location.replace('/app-auth.html?app=1&error=account_deactivated');true;`
  );
}

function buildAppShellBootstrap(frontendBase) {
  const isDevLocal = isDevLocalBase(frontendBase);
  const injectedApi = isDevLocal ? `${frontendBase}/api` : PRODUCTION_API;
  const injectedSocket = isDevLocal ? frontendBase : apiConfig.BACKEND_URL;
  const oauthReturn = APP_RETURN_URL.replace(/'/g, "\\'");
  return `(function(){try{
    var p=(location.pathname||'').toLowerCase();
    var immersive=p.endsWith('/live-room.html')||p.endsWith('/party-room.html');
    window.__AP_NATIVE_APP__=true;
    window.__AP_API_URL__='${injectedApi}';
    window.__AP_SOCKET_URL__='${injectedSocket}';
    window.__AP_OAUTH_RETURN__='${oauthReturn}';
    try{localStorage.setItem('app_redirect','${oauthReturn}');}catch(e){}
    document.documentElement.style.setProperty('--ap-expo-safe-top','0px');
    document.documentElement.classList.add('ap-expo-app','auth-native');
    if(immersive){
      document.documentElement.classList.add('ap-live-immersive');
      document.documentElement.classList.remove('social-app','social-bridge-mode','social-native');
      document.documentElement.style.setProperty('--social-bottom-nav-h','0px');
      document.documentElement.style.background='#000';
      if(document.body){
        document.body.classList.add('ap-live-immersive');
        document.body.style.background='#000';
      }
    }else{
      document.documentElement.classList.add('social-app','social-bridge-mode','social-native');
      document.documentElement.style.background='#faf6ee';
      if(document.body)document.body.style.background='#faf6ee';
    }
    var s=document.getElementById('ap-native-critical');
    if(!s){
      s=document.createElement('style');
      s.id='ap-native-critical';
      s.textContent='html.ap-expo-app .chat-tab.active{background:linear-gradient(135deg,#d4a84b,#9a7218)!important;color:#fff!important}html.ap-expo-app .message-wrapper.sent .message-content{background:linear-gradient(135deg,#d4a84b,#9a7218)!important;color:#fff!important}html.ap-live-immersive .social-bridge-header,html.ap-live-immersive #ap-bridge-header,html.ap-live-immersive .social-bottom-nav,html.ap-live-immersive #social-bottom-nav-mount,html.ap-live-immersive .navbar,html.ap-live-immersive footer.site-footer{display:none!important;height:0!important;visibility:hidden!important;pointer-events:none!important}html.ap-live-immersive body,html.ap-live-immersive.social-bridge-mode body{padding:0!important;margin:0!important;background:#000!important;overflow:hidden!important}';
      (document.head||document.documentElement).appendChild(s);
    }
    function apHasSession(){try{return!!(localStorage.getItem('user')||localStorage.getItem('token'));}catch(e){return false;}}
    window.__AP_HAS_NATIVE_SESSION__=apHasSession;
    function apNativeHome(){
      var q='?app=1&source=expo-app';
      try{
        var u=JSON.parse(localStorage.getItem('user')||'null');
        if(u&&u.role==='admin')return '/admin-dashboard.html'+q;
        if(u&&u.role==='worker')return '/worker-dashboard.html'+q;
      }catch(e){}
      return '/explore.html'+q;
    }
    var apPath=(location.pathname||'').toLowerCase();
    if(!apPath.endsWith('/login-success.html')){
      var apOnAuth=apPath.endsWith('/app-auth.html')||apPath.endsWith('/login.html')||apPath.endsWith('/register.html');
      var apOnExplore=apPath.endsWith('/explore.html');
      if(apOnAuth&&apHasSession()){
        document.documentElement.classList.add('auth-restoring');
        location.replace(apNativeHome());
      }else if(apOnExplore&&!apHasSession()){
        document.documentElement.classList.add('auth-restoring');
        location.replace('/app-auth.html?app=1&source=expo-app');
      }
    }
    if('serviceWorker' in navigator&&localStorage.getItem('ap_clear_sw')==='1'){
      navigator.serviceWorker.getRegistrations().then(function(regs){
        regs.forEach(function(r){r.unregister();});
      }).catch(function(){});
      try{localStorage.removeItem('ap_clear_sw');}catch(e){}
    }
  }catch(e){}})();true;`;
}

function switchToProductionFrontend(setFrontendBase, setLanFallbackDone, setLoadError, frontendBase) {
  if (LAN_DEV_LOCKED) {
    console.warn('[ap-services-app] LAN unreachable - staying on local UI');
    setLoadError(
      `Cannot reach ${frontendBase}. Same Wi-Fi? Allow port 5500 in firewall, then press r to reload.`
    );
    return;
  }
  console.warn('[ap-services-app] LAN unreachable - switching to production HTTPS');
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

function buildSessionInjectScript(user, accessToken, refreshToken) {
  const userJson = JSON.stringify(user);
  let script = `(function(){try{localStorage.setItem('user',${JSON.stringify(userJson)});`;
  if (accessToken) {
    script += `localStorage.setItem('token',${JSON.stringify(String(accessToken))});`;
  } else {
    script += `localStorage.removeItem('token');`;
  }
  if (refreshToken) {
    script += `localStorage.setItem('ap_refresh_token',${JSON.stringify(String(refreshToken))});`;
  }
  script += `if(window.AppState){try{AppState.user=JSON.parse(${JSON.stringify(userJson)});}catch(e){}}`;
  script += `window.__AP_LOGGED_IN__=true;}catch(e){}})();`;
  return script;
}

function buildClearSessionScript() {
  return `(function(){try{localStorage.removeItem('user');localStorage.removeItem('token');localStorage.removeItem('ap_refresh_token');if(window.AppState){AppState.user=null;AppState.token=null;}window.__AP_LOGGED_IN__=false;}catch(e){}})();true;`;
}

function buildNavigateScript(user, accessToken, dest, refreshToken) {
  return (
    buildSessionInjectScript(user, accessToken, refreshToken) +
    `window.location.replace(${JSON.stringify(dest)}); true;`
  );
}

function isAccessTokenUsable(token, skewSec = 30) {
  if (!token) return false;
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp) return true;
    return payload.exp > Math.floor(Date.now() / 1000) + skewSec;
  } catch (_e) {
    return false;
  }
}

async function refreshNativeSession(sess) {
  let { user, accessToken, refreshToken } = sess;
  if (accessToken && isAccessTokenUsable(accessToken)) {
    return { user, accessToken, refreshToken };
  }
  if (!refreshToken) return sess;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.data?.accessToken) {
      return {
        user: data.data.user || user,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken || refreshToken,
      };
    }
  } catch (_e) {
    /* ignore */
  }
  return sess;
}

export default function App() {
  const webViewRef = useRef(null);
  const pendingTokenRef = useRef(null);
  const webViewReadyRef = useRef(false);
  const webViewCurrentUrlRef = useRef('');
  const webViewCanGoBackRef = useRef(false);
  const homeBackAtRef = useRef(0);
  const handledTokenRef = useRef('');
  const processingCredRef = useRef('');
  const oauthBusyRef = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [sessionInject, setSessionInject] = useState('');
  const [frontendBase, setFrontendBase] = useState(() => resolveFrontendBase());
  const [lanFallbackDone, setLanFallbackDone] = useState(false);
  const nativeSessionRef = useRef(null);
  const oauthCompleteRef = useRef(false);
  const screenCaptureBlockedRef = useRef(false);
  /** WebView source is set once — post-login navigation uses injectJavaScript only */
  const webSourceUriRef = useRef('');

  const lockLiveScreenCapture = useCallback(async (force = false) => {
    screenCaptureBlockedRef.current = true;
    try {
      await ScreenCapture.preventScreenCaptureAsync(LIVE_SECURE_KEY);
      if (force) {
        const bump = `ap-live-secure-bump-${Date.now() % 100000}`;
        await ScreenCapture.preventScreenCaptureAsync(bump);
      }
    } catch (err) {
      console.warn('[screen-capture] lock failed', err?.message || err);
    }
  }, []);

  const unlockLiveScreenCapture = useCallback(async () => {
    if (!screenCaptureBlockedRef.current) return;
    try {
      await ScreenCapture.allowScreenCaptureAsync(LIVE_SECURE_KEY);
      await ScreenCapture.allowScreenCaptureAsync('default');
    } catch (err) {
      console.warn('[screen-capture] unlock failed', err?.message || err);
    } finally {
      screenCaptureBlockedRef.current = false;
    }
  }, []);

  const syncScreenCaptureForUrl = useCallback(
    async (url) => {
      if (isLiveCaptureUrl(url)) {
        await lockLiveScreenCapture(true);
      } else {
        await unlockLiveScreenCapture();
      }
    },
    [lockLiveScreenCapture, unlockLiveScreenCapture]
  );

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
    if (isDevLocal) return;
    let cancelled = false;
    fetch(`${PRODUCTION_WEB}/api/health`, { method: 'GET' })
      .then((res) => {
        if (cancelled || res.ok) return;
        setLoadError(`Server returned ${res.status}. Wait a minute and reload the app.`);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            `No connection to ${PRODUCTION_WEB}. Check Wi-Fi/mobile data, then force-close and reopen the app.`
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isDevLocal]);

  useEffect(() => {
    webViewReadyRef.current = false;
    const timer = setTimeout(() => {
      if (webViewReadyRef.current) return;
      if (isDevLocal && !lanFallbackDone) {
        switchToProductionFrontend(setFrontendBase, setLanFallbackDone, setLoadError, frontendBase);
        return;
      }
      setLoadError(
        isDevLocal
          ? `Cannot reach ${frontendBase}. Use npm start (live mode) or npm run start:lan with phone on same Wi-Fi.`
          : `Still loading ${frontendBase} — slow network? Pull down to refresh or wait, then reload the app.`
      );
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [frontendBase, isDevLocal, lanFallbackDone]);

  const launchUrl = useMemo(() => {
    const params = new URLSearchParams({
      app_redirect: APP_RETURN_URL,
      source: 'expo-app',
      app: '1',
      v: APP_WEB_BUILD,
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
    }, 50);
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
        let refreshToken = null;

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
          refreshToken = data.data.refreshToken || null;
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
        nativeSessionRef.current = { user, accessToken, refreshToken };
        oauthCompleteRef.current = true;
        handledTokenRef.current = credKey;
        setLoadError('');
        const sessionScript = buildSessionInjectScript(user, accessToken, refreshToken);
        setSessionInject(sessionScript);

        console.log('[ap-services-app] Login OK - opening', dest);
        if (!accessToken) {
          console.warn('[ap-services-app] No accessToken from API - modules may show session expired until VPS is updated');
        }

        const goScript = buildNavigateScript(user, accessToken, dest, refreshToken);
        const tryGo = () => webViewRef.current?.injectJavaScript(goScript);
        tryGo();
        setTimeout(tryGo, 150);
        setTimeout(tryGo, 500);
      } catch (err) {
        console.warn('[ap-services-app] Login exchange failed', err);
        const msg = err.message || 'Sign in failed. Try Google again.';
        if (/deactivat/i.test(msg)) {
          setLoadError('');
          clearNativeSession();
          webViewRef.current?.injectJavaScript(redirectDeactivatedInWebView(msg));
        } else {
          setLoadError(msg);
        }
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

  /* Screenshots allowed everywhere except live/party rooms */
  useEffect(() => {
    unlockLiveScreenCapture().catch(() => {});
  }, [unlockLiveScreenCapture]);

  /* Keep FLAG_SECURE asserted while inside a live/party room only */
  useEffect(() => {
    const id = setInterval(() => {
      const url = webViewCurrentUrlRef.current || '';
      if (!isLiveCaptureUrl(url)) return;
      ScreenCapture.preventScreenCaptureAsync(LIVE_SECURE_KEY).catch(() => {});
      const bump = `ap-live-secure-bump-${Date.now() % 100000}`;
      ScreenCapture.preventScreenCaptureAsync(bump).catch(() => {});
      screenCaptureBlockedRef.current = true;
    }, 1500);
    return () => clearInterval(id);
  }, []);

  /* Screenshot attempt: re-lock only on live/party */
  useEffect(() => {
    let sub;
    try {
      sub = ScreenCapture.addScreenshotListener(() => {
        const url = webViewCurrentUrlRef.current || '';
        if (!isLiveCaptureUrl(url)) return;
        lockLiveScreenCapture(true);
        if (Platform.OS === 'android' && ToastAndroid) {
          ToastAndroid.show('Screenshots are blocked during live streams', ToastAndroid.SHORT);
        }
        webViewRef.current?.injectJavaScript(
          `(function(){try{
            if(window.SocialLive&&window.SocialLive.onScreenshotAttempt){window.SocialLive.onScreenshotAttempt();}
          }catch(e){}true;})();`
        );
      });
    } catch (_e) { /* older native builds */ }
    return () => {
      try {
        sub?.remove?.();
      } catch (_e2) { /* ignore */ }
    };
  }, [lockLiveScreenCapture]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const onHardwareBack = () => {
      const url = webViewCurrentUrlRef.current || '';
      const onLiveUrl = /live-room\.html|party-room\.html/i.test(url);
      if (onLiveUrl) {
        webViewRef.current?.injectJavaScript(LIVE_MINIMIZE_INJECT);
        return true;
      }
      webViewRef.current?.injectJavaScript(
        `(function(){
          try {
            var raw = localStorage.getItem('ap_live_active_session') || sessionStorage.getItem('ap_live_pip_session');
            if (raw) {
              var d = JSON.parse(raw);
              if (d && d.url && /live-room\\.html|party-room\\.html/i.test(d.url) && (!d.expiresAt || Date.now() < d.expiresAt)) {
                if (window.LiveSession && window.LiveSession.onAndroidBack && window.LiveSession.onAndroidBack()) return;
                if (window.LiveSession && window.LiveSession.isMinimized && window.LiveSession.isMinimized()) return;
                location.href = d.url;
                return;
              }
            }
          } catch(e) {}
        })();` + HARDWARE_BACK_INJECT
      );
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const onAppStateChange = (nextState) => {
      if (!webViewRef.current) return;
      if (nextState === 'background' || nextState === 'inactive') {
        webViewRef.current.injectJavaScript(LIVE_APP_BACKGROUND_INJECT);
      } else if (nextState === 'active') {
        const url = webViewCurrentUrlRef.current || '';
        /* Phase 2A: re-apply native live route on foreground (speaker/BT). */
        if (isLiveCaptureUrl(url)) {
          LiveAudioRoute.onAppForeground().catch(() => {});
          lockLiveScreenCapture(true);
        }
        webViewRef.current.injectJavaScript(LIVE_APP_FOREGROUND_INJECT);
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [lockLiveScreenCapture]);

  useEffect(() => {
    if (__DEV__) LiveAudioRoute.setDebug(true);
    const unsub = LiveAudioRoute.subscribe((evt) => {
      if (__DEV__ || evt?.event === 'transition' || evt?.event === 'route_change') {
        console.warn('[LiveAudioRoute:app]', evt?.event, evt);
      }
    });
    return () => {
      try {
        unsub?.();
      } catch (_e) {}
    };
  }, []);

  useEffect(() => {
    /* Do NOT force audio mode on cold start — that steals YouTube/media focus
       before any live audio is playing (silent app, other media killed). */
    requestAndroidMediaPermissions({ microphone: false }).catch(() => {});
  }, []);

  const clearNativeSession = useCallback(() => {
    nativeSessionRef.current = null;
    oauthCompleteRef.current = false;
    handledTokenRef.current = '';
    processingCredRef.current = '';
    setSessionInject('');
  }, []);

  const onWebViewMessage = useCallback(
    (event) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'logout' || data.type === 'account_deactivated') {
          clearNativeSession();
          setLoadError('');
          webViewRef.current?.injectJavaScript(buildClearSessionScript());
          if (data.type === 'account_deactivated') {
            webViewRef.current?.injectJavaScript(redirectDeactivatedInWebView(data.message));
          }
          return;
        }
        if (data.type === 'request_session') {
          const sess = nativeSessionRef.current;
          if (sess?.user) {
            (async () => {
              const fresh = await refreshNativeSession(sess);
              nativeSessionRef.current = fresh;
              const inject =
                buildSessionInjectScript(fresh.user, fresh.accessToken, fresh.refreshToken) +
                `try{window.dispatchEvent(new CustomEvent('ap-session-injected'));window.dispatchEvent(new CustomEvent('ap-session-restored'));}catch(e){};true;`;
              webViewRef.current?.injectJavaScript(inject);
            })();
            return;
          }
          // App process lost in-memory session but WebView still has user — rebuild from WebView storage.
          webViewRef.current?.injectJavaScript(`
            (function(){
              try {
                var u = null;
                try { u = JSON.parse(localStorage.getItem('user') || 'null'); } catch (_e) {}
                window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'session_snapshot',
                  user: u,
                  accessToken: localStorage.getItem('token') || null,
                  refreshToken: localStorage.getItem('ap_refresh_token') || null
                }));
              } catch (e) {}
              true;
            })();
          `);
          return;
        }
        if (data.type === 'session_snapshot') {
          if (!data.user) {
            webViewRef.current?.injectJavaScript(
              `try{window.dispatchEvent(new CustomEvent('ap-session-injected'));}catch(e){};true;`
            );
            return;
          }
          (async () => {
            const seed = {
              user: data.user,
              accessToken: data.accessToken || null,
              refreshToken: data.refreshToken || null,
            };
            const fresh = await refreshNativeSession(seed);
            nativeSessionRef.current = fresh;
            const inject =
              buildSessionInjectScript(fresh.user, fresh.accessToken, fresh.refreshToken) +
              `try{window.dispatchEvent(new CustomEvent('ap-session-injected'));window.dispatchEvent(new CustomEvent('ap-session-restored'));}catch(e){};true;`;
            webViewRef.current?.injectJavaScript(inject);
          })();
          return;
        }
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
            refreshToken: data.refreshToken || null,
          };
          oauthCompleteRef.current = true;
          setSessionInject(
            buildSessionInjectScript(data.user, data.accessToken || null, data.refreshToken || null)
          );
          webViewRef.current?.injectJavaScript(
            buildNavigateScript(data.user, data.accessToken || null, dest, data.refreshToken || null)
          );
          return;
        }
        if (data.type === 'request_media_permissions') {
          (async () => {
            const needMic = data.microphone !== false;
            /* Android: recording/communication mode enables HW AEC that cancels host voice.
             * WebView getUserMedia still works in playback mode. iOS still needs recording. */
            const useRecordingMode =
              Platform.OS === 'ios' && needMic && data.recordingAudioMode !== false;
            await forceSpeakerAudioMode({ recording: useRecordingMode });
            const result = await requestAndroidMediaPermissions({
              microphone: needMic,
            });
            await forceSpeakerAudioMode({ recording: useRecordingMode });
            webViewRef.current?.injectJavaScript(buildMediaPermissionResultScript(result));
          })();
          return;
        }
        if (data.type === 'temp_voice_route_debug') {
          /* TEMPORARY — logcat for iQOO/BT investigation; remove after */
          console.warn('[TEMP-VOICE-ROUTE:wv]', data.entry?.type, data.entry || data);
          return;
        }
        if (data.type === 'live_audio_route') {
          const action = String(data.action || '');
          const reason = data.reason || action;
          if (action === 'enterPlayback') {
            LiveAudioRoute.enterPlayback(reason).catch(() => {});
          } else if (action === 'enterTalk') {
            LiveAudioRoute.enterTalk({
              bluetoothSafe: data.bluetoothSafe !== false,
              reason,
            }).catch(() => {});
          } else if (action === 'exitTalk') {
            LiveAudioRoute.exitTalk(reason).catch(() => {});
          } else if (action === 'leaveLive') {
            LiveAudioRoute.leaveLive(reason).catch(() => {});
          } else if (action === 'reevaluate') {
            LiveAudioRoute.reevaluate(reason).catch(() => {});
          } else if (action === 'debug') {
            LiveAudioRoute.setDebug(data.enabled !== false);
          }
          return;
        }
        if (data.type === 'force_speaker_audio') {
          /* Compat: map old web posts onto LiveAudioRoute */
          if (data.recording === true) {
            LiveAudioRoute.enterTalk({
              bluetoothSafe: data.bluetoothSafe !== false,
              reason: 'force_speaker_audio',
            }).catch(() => {});
          } else if (isLiveCaptureUrl(webViewCurrentUrlRef.current || '')) {
            LiveAudioRoute.enterPlayback('force_speaker_audio').catch(() => {});
          }
          return;
        }
        if (data.type === 'share') {
          const url = String(data.url || '').trim();
          const title = String(data.title || 'AP Services');
          let text = String(data.text || 'Join me on AP Services').trim();
          if (url && text.includes(url)) {
            Share.share({ title, message: text }).catch(() => {});
            return;
          }
          Share.share(
            Platform.OS === 'ios'
              ? url
                ? { title, message: text, url }
                : { title, message: text }
              : { title, message: url ? `${text}\n${url}` : text }
          ).catch(() => {});
          return;
        }
        if (data.type === 'screen_capture') {
          (async () => {
            try {
              const enabled = data.enabled !== false && data.block !== false;
              const url = webViewCurrentUrlRef.current || '';
              if (enabled && (data.force || isLiveCaptureUrl(url))) {
                await lockLiveScreenCapture(true);
              } else if (!enabled) {
                await unlockLiveScreenCapture();
              }
            } catch (err) {
              console.warn('[screen-capture]', err?.message || err);
            }
          })();
          return;
        }
        if (data.type === 'hardware_back_handled' || data.type === 'back_handled') {
          return;
        }
        if (data.type === 'back_result' && !data.handled) {
          const route = String(data.route || '');
          const currentUrl = webViewCurrentUrlRef.current || '';
          const onLive =
            /live-room\.html|party-room\.html/i.test(route) ||
            /live-room\.html|party-room\.html/i.test(currentUrl);
          if (onLive) {
            webViewRef.current?.injectJavaScript(LIVE_MINIMIZE_INJECT);
            return;
          }
          const onExplore =
            data.onExplore === true ||
            /explore\.html/i.test(route) ||
            /explore\.html/i.test(currentUrl);

          /*
           * Never WebView.goBack() from home — history often points at login/blank
           * and feels like the whole app closed. Stay in-app; double-press to exit.
           */
          if (onExplore) {
            webViewRef.current?.injectJavaScript(`(function(){
              try {
                var raw = localStorage.getItem('ap_live_active_session') || sessionStorage.getItem('ap_live_pip_session');
                if (raw) {
                  var d = JSON.parse(raw);
                  if (d && d.url && (!d.expiresAt || Date.now() < d.expiresAt) && /live-room\\.html|party-room\\.html/i.test(d.url)) {
                    if (window.LiveSession && window.LiveSession.expand) { window.LiveSession.expand(); return; }
                    location.href = d.url;
                    return;
                  }
                }
              } catch(e) {}
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'back_result_exit_ok'}));
            })();true;`);
            return;
          }

          /* Any other page: return to Explore — never exit the app */
          webViewRef.current?.injectJavaScript(
            `window.location.href='/explore.html?app=1&source=expo-app';true;`
          );
          return;
        }
        if (data.type === 'back_result_exit_ok') {
          const now = Date.now();
          if (now - homeBackAtRef.current < 2500) {
            homeBackAtRef.current = 0;
            BackHandler.exitApp();
            return;
          }
          homeBackAtRef.current = now;
          if (Platform.OS === 'android') {
            ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
          }
          return;
        }
      } catch (_e) {
        /* not our message */
      }
    },
    [startOAuthInBrowser, frontendBase, clearNativeSession, lockLiveScreenCapture, unlockLiveScreenCapture]
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
  // Session tokens live in WebView localStorage — do not re-inject on every page (breaks logout).
  const injectedBootstrap = appShellBootstrap;

  const tryLanFallback = useCallback(() => {
    if (LAN_DEV_LOCKED) return false;
    if (!lanFallbackDone && isDevLocal) {
      switchToProductionFrontend(setFrontendBase, setLanFallbackDone, setLoadError, frontendBase);
      return true;
    }
    return false;
  }, [isDevLocal, lanFallbackDone, frontendBase]);

  return (
    <View style={[styles.container, { paddingTop: STATUS_BAR_INSET }]}>
      <StatusBar style="dark" />
      {loadError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{loadError}</Text>
          {shouldShowLoadErrorHint(loadError) ? (
            <Text style={styles.errorHint}>{loadErrorHint(isDevLocal, frontendBase)}</Text>
          ) : null}
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
            <Image source={BRAND_LOGO} style={styles.loadingLogo} resizeMode="contain" />
            <ActivityIndicator size="large" color="#2F7BFF" style={{ marginTop: 18 }} />
            <Text style={styles.loadingText}>Loading…</Text>
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
        onLoadProgress={({ nativeEvent }) => {
          if (nativeEvent?.progress >= 0.25) setLoadError('');
          if (nativeEvent?.progress >= 1) webViewReadyRef.current = true;
        }}
        onLoadEnd={(e) => {
          webViewReadyRef.current = true;
          setLoadError('');
          const url = e?.nativeEvent?.url || '';
          injectMobileLayout(url);
          syncScreenCaptureForUrl(url);
          /* Phase 2A: audience playback focus when entering live/party pages. */
          if (isLiveCaptureUrl(url)) {
            LiveAudioRoute.enterPlayback('webview_load').catch(() => {});
          } else {
            LiveAudioRoute.leaveLive('webview_load_non_live').catch(() => {});
          }
        }}
        onNavigationStateChange={(nav) => {
          const url = nav?.url || '';
          const prev = webViewCurrentUrlRef.current || '';
          if (url) webViewCurrentUrlRef.current = url;
          webViewCanGoBackRef.current = Boolean(nav?.canGoBack);
          syncScreenCaptureForUrl(url);
          const nowLive = isLiveCaptureUrl(url);
          const wasLive = isLiveCaptureUrl(prev);
          if (nowLive && !wasLive) {
            LiveAudioRoute.enterPlayback('nav_enter_live').catch(() => {});
          } else if (!nowLive && wasLive) {
            LiveAudioRoute.leaveLive('nav_leave_live').catch(() => {});
          } else if (nowLive) {
            /* Stay in current livePlay/liveTalk — don't downgrade talk→play on every nav tick */
          }
          if (url.includes('explore.html') || url.includes('dashboard')) {
            oauthCompleteRef.current = true;
            setLoadError('');
          }
          if (url.includes('app-auth.html') || url.includes('account_deactivated')) {
            setLoadError('');
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
        cacheEnabled={__DEV__}
        cacheMode={Platform.OS === 'android' ? (__DEV__ ? 'LOAD_DEFAULT' : 'LOAD_NO_CACHE') : undefined}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        allowsPictureInPictureMediaPlayback={false}
        mediaPlaybackRequiresUserAction={false}
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
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  loadingLogo: {
    width: 168,
    height: 168,
    borderRadius: 84,
  },
  loadingText: { marginTop: 14, color: '#9ec4ff', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  errorBar: {
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    padding: 10,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  errorHint: { color: '#7f1d1d', fontSize: 11, marginTop: 4 },
});
