import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { AuthCard, ErrorBanner, Field, GoldButton, OAuthButton, OutlineButton } from '../../components/ui';
import { CreamHeader } from '../../components/creamChrome';

export default function LoginScreen({ navigation }) {
  const { login, startOAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState('');

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider) => {
    setError('');
    setOauthBusy(provider);
    try {
      await startOAuth(provider);
    } catch (e) {
      setError(e.message || 'Sign in failed');
    } finally {
      setOauthBusy('');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CreamHeader title="Sign in" navigation={navigation} hideRight />
      <ScrollView contentContainerStyle={styles.scroll}>
        <AuthCard>
          <Text style={styles.logo}>AP <Text style={styles.logoGold}>Live Service</Text></Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.sub}>Use Google, Facebook, GitHub, or your email</Text>
          <ErrorBanner message={error} />
          <OAuthButton title={oauthBusy === 'google' ? 'Opening Google…' : 'Continue with Google'} ion="logo-google" iconColor="#ea4335" onPress={() => oauth('google')} disabled={!!oauthBusy || busy} />
          <View style={{ height: 8 }} />
          <OAuthButton title={oauthBusy === 'facebook' ? 'Opening Facebook…' : 'Continue with Facebook'} ion="logo-facebook" iconColor="#1877f2" onPress={() => oauth('facebook')} disabled={!!oauthBusy || busy} />
          <View style={{ height: 8 }} />
          <OAuthButton title={oauthBusy === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'} ion="logo-github" iconColor="#111827" onPress={() => oauth('github')} disabled={!!oauthBusy || busy} />
          <View style={{ height: 8 }} />
          <OutlineButton title="Continue with Phone" onPress={() => navigation.navigate('PhoneAuth')} disabled={!!oauthBusy || busy} />
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.divText}>or email</Text>
            <View style={styles.line} />
          </View>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@email.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
          <GoldButton title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy || !!oauthBusy} />
          <View style={{ height: 12 }} />
          <OutlineButton title="Create account" onPress={() => navigation.navigate('Register')} />
        </AuthCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  scroll: { padding: 16, paddingTop: 24 },
  logo: { textAlign: 'center', fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  logoGold: { color: colors.gold500 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  sub: { color: colors.textSecondary, marginBottom: 16, marginTop: 6, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  line: { flex: 1, height: 1, backgroundColor: 'rgba(201, 162, 39, 0.25)' },
  divText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
