import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { AuthCard, ErrorBanner, OAuthButton, OutlineButton } from '../../components/ui';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { startOAuth } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const oauth = async (provider) => {
    setError('');
    setBusy(provider);
    try {
      await startOAuth(provider);
    } catch (e) {
      setError(e.message || 'Sign in failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: insets.bottom + 24 }]}>
        <AuthCard>
          <Image source={require('../../../assets/logo-loading.png')} style={styles.logo} />
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.sub}>Continue with Google, Facebook, GitHub, or your phone number.</Text>
          <ErrorBanner message={error} />
          <View style={{ height: 8 }} />
          <OAuthButton
            title={busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
            ion="logo-google"
            iconColor="#ea4335"
            onPress={() => oauth('google')}
            disabled={!!busy}
          />
          <View style={{ height: 10 }} />
          <OAuthButton
            title={busy === 'facebook' ? 'Opening Facebook…' : 'Continue with Facebook'}
            ion="logo-facebook"
            iconColor="#1877f2"
            onPress={() => oauth('facebook')}
            disabled={!!busy}
          />
          <View style={{ height: 10 }} />
          <OAuthButton
            title={busy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}
            ion="logo-github"
            iconColor="#111827"
            onPress={() => oauth('github')}
            disabled={!!busy}
          />
          <View style={{ height: 10 }} />
          <OutlineButton
            title="Continue with Phone"
            onPress={() => navigation.navigate('PhoneAuth')}
            disabled={!!busy}
          />

          <View style={styles.benefits}>
            <Text style={styles.benefitTitle}>Why AP Live Service?</Text>
            <Text style={styles.li}>✓  Go live & join party rooms</Text>
            <Text style={styles.li}>✓  Send gifts & earn rewards</Text>
            <Text style={styles.li}>✓  Host & agency tools</Text>
            <Text style={styles.li}>✓  Secure login & wallet</Text>
          </View>
          <View style={styles.quote}>
            <Text style={styles.quoteText}>“Love going live and connecting with my audience on AP Live Service!”</Text>
            <Text style={styles.cite}>— Host community</Text>
          </View>
        </AuthCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  scroll: { paddingHorizontal: 16 },
  logo: { width: 48, height: 48, borderRadius: 24, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: colors.textPrimary },
  sub: { textAlign: 'center', color: colors.textSecondary, marginTop: 6, marginBottom: 12, fontSize: 14, lineHeight: 20 },
  benefits: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(201, 162, 39, 0.2)' },
  benefitTitle: { fontWeight: '700', color: colors.textGold, marginBottom: 8, fontSize: 14 },
  li: { color: colors.textSecondary, marginBottom: 6, fontSize: 13 },
  quote: {
    marginTop: 16,
    padding: 14,
    backgroundColor: 'rgba(201, 162, 39, 0.08)',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold500,
  },
  quoteText: { color: colors.textGold, fontStyle: 'italic', fontSize: 13, lineHeight: 20 },
  cite: { marginTop: 8, color: colors.gold600, fontSize: 12, fontWeight: '700' },
});
