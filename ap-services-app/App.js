import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';

const FRONTEND_URL = 'https://ap-sevces.vercel.app';
const APP_REDIRECT_SCHEME = 'apservices://oauth-complete';

export default function App() {
  const webViewRef = useRef(null);
  const pendingTokenRef = useRef('');
  const webViewReadyRef = useRef(false);
  const launchUrl = useMemo(() => {
    const params = new URLSearchParams({
      app_redirect: APP_REDIRECT_SCHEME,
      source: 'expo-app',
      v: String(Date.now())
    });
    const separator = FRONTEND_URL.includes('?') ? '&' : '?';
    return `${FRONTEND_URL}${separator}${params.toString()}`;
  }, []);

  const injectTokenAndRedirect = (token) => {
    if (!token || !webViewRef.current || !webViewReadyRef.current) return false;
    const script = `
      (function() {
        try {
          localStorage.setItem('token', ${JSON.stringify(token)});
          localStorage.removeItem('app_redirect');
          window.location.href = '/login-success.html?token=' + encodeURIComponent(${JSON.stringify(token)});
        } catch (e) {}
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(script);
    return true;
  };

  const queueOrInjectToken = (token) => {
    if (!token) return;
    pendingTokenRef.current = token;
    const used = injectTokenAndRedirect(token);
    if (used) pendingTokenRef.current = '';
  };

  useEffect(() => {
    const handleDeepLink = ({ url }) => {
      try {
        const parsed = Linking.parse(url);
        const token = parsed?.queryParams?.token;
        if (typeof token === 'string' && token.length > 0) queueOrInjectToken(token);
      } catch (_err) {}
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL()
      .then((initialUrl) => {
        if (initialUrl) handleDeepLink({ url: initialUrl });
      })
      .catch(() => {});

    return () => {
      subscription.remove();
    };
  }, []);

  const onShouldStartLoadWithRequest = (request) => {
    const url = request?.url || '';
    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch (e) {
      hostname = '';
    }
    if (url.startsWith('apservices://')) {
      const parsed = Linking.parse(url);
      const token = parsed?.queryParams?.token;
      if (typeof token === 'string' && token.length > 0) {
        queueOrInjectToken(token);
      }
      return false;
    }

    const shouldOpenExternal =
      hostname === 'accounts.google.com' ||
      hostname === 'google.com' ||
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
        onLoadEnd={() => {
          webViewReadyRef.current = true;
          if (pendingTokenRef.current) {
            const used = injectTokenAndRedirect(pendingTokenRef.current);
            if (used) pendingTokenRef.current = '';
          }
        }}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        cacheMode={Platform.OS === 'android' ? 'LOAD_NO_CACHE' : undefined}
        sharedCookiesEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
