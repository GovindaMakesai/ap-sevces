import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { AuthCard, ErrorBanner, Field, GoldButton, OutlineButton } from '../../components/ui';
import { CreamHeader } from '../../components/creamChrome';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CreamHeader title="Sign in" navigation={navigation} hideRight />
      <ScrollView contentContainerStyle={styles.scroll}>
        <AuthCard>
          <Text style={styles.logo}>AP <Text style={styles.logoGold}>Live Service</Text></Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.sub}>Use your AP Live Service account</Text>
          <ErrorBanner message={error} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@email.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
          <GoldButton title={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={busy} />
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
  sub: { color: colors.textSecondary, marginBottom: 20, marginTop: 6, textAlign: 'center' },
});
