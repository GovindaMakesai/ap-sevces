import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';

const FRONTEND_URL = 'https://ap-sevces.vercel.app';

export default function App() {
  const onShouldStartLoadWithRequest = (request) => {
    const url = request?.url || '';
    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch (e) {
      hostname = '';
    }
    const shouldOpenExternal =
      hostname === 'accounts.google.com' ||
      hostname === 'google.com' ||
      hostname.endsWith('.google.com');

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
        source={{ uri: FRONTEND_URL }}
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
