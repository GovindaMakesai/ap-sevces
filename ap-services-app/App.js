import { SafeAreaView, StyleSheet } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';

const FRONTEND_URL = 'https://ap-sevces.vercel.app';
const APP_REDIRECT_SCHEME = 'apservices://oauth-complete';

export default function App() {
  const webViewRef = useRef(null);
  const launchUrl = useMemo(() => {
    const separator = FRONTEND_URL.includes('?') ? '&' : '?';
    return `${FRONTEND_URL}${separator}app_redirect=${encodeURIComponent(APP_REDIRECT_SCHEME)}`;
  }, []);

  const injectTokenAndRedirect = (token) => {
    if (!token || !webViewRef.current) return;
    const script = `
      (function() {
        try {
          localStorage.setItem('token', ${JSON.stringify(token)});
          window.location.href = '/login-success.html?token=' + encodeURIComponent(${JSON.stringify(token)});
        } catch (e) {}
      })();
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  };

  useEffect(() => {
    const handleDeepLink = ({ url }) => {
      try {
        const parsed = Linking.parse(url);
        const token = parsed?.queryParams?.token;
        if (typeof token === 'string' && token.length > 0) {
          injectTokenAndRedirect(token);
        }
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
        injectTokenAndRedirect(token);
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
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
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
