import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { AuthCard, ErrorBanner, Field, GoldButton } from '../../components/ui';
import { CreamHeader } from '../../components/creamChrome';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [first_name, setFirst] = useState('');
  const [last_name, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await register({ first_name, last_name, email: email.trim(), phone: phone.trim(), password });
    } catch (e) {
      setError(e.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CreamHeader title="Create account" navigation={navigation} hideRight />
      <ScrollView contentContainerStyle={styles.scroll}>
        <AuthCard>
          <Text style={styles.logo}>AP <Text style={styles.logoGold}>Live Service</Text></Text>
          <Text style={styles.title}>Create account</Text>
          <ErrorBanner message={error} />
          <Field label="First name" value={first_name} onChangeText={setFirst} autoCapitalize="words" />
          <Field label="Last name" value={last_name} onChangeText={setLast} autoCapitalize="words" />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Phone (10-digit India)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          <GoldButton title={busy ? 'Creating…' : 'Sign up'} onPress={submit} disabled={busy} />
          <View style={{ height: 16 }} />
          <Text style={styles.link} onPress={() => navigation.goBack()}>Already have an account? Sign in</Text>
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
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 16, textAlign: 'center' },
  link: { textAlign: 'center', color: colors.gold600, fontWeight: '700' },
});
