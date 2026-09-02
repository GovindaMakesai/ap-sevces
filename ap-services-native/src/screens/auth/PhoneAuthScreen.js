import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../config/theme';
import { AuthCard, ErrorBanner, GoldButton, OutlineButton } from '../../components/ui';
import { CreamHeader } from '../../components/creamChrome';

const COUNTRY_OPTIONS = [{ code: 'IN', dial: '+91', label: 'India' }];
const RESEND_COOLDOWN_SEC = 60;

function maskPhoneDisplay(phone) {
  const s = String(phone || '');
  if (s.length < 6) return s;
  const tail = s.slice(-4);
  const head = s.slice(0, Math.max(3, s.length - 8));
  return `${head}${'•'.repeat(Math.max(0, s.length - head.length - 4))}${tail}`;
}

function OtpBoxes({ value, onChange, disabled }) {
  const refs = useRef([]);
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 6)
    .split('');
  while (digits.length < 6) digits.push('');

  const setDigit = (index, char) => {
    const next = digits.slice();
    next[index] = char.replace(/\D/g, '').slice(-1);
    onChange(next.join('').slice(0, 6));
    if (char && index < 5) refs.current[index + 1]?.focus();
  };

  const onKey = (index, e) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.otpRow}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(r) => {
            refs.current[i] = r;
          }}
          style={styles.otpBox}
          value={d}
          onChangeText={(t) => setDigit(i, t)}
          onKeyPress={(e) => onKey(i, e)}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

export default function PhoneAuthScreen({ navigation }) {
  const { sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [step, setStep] = useState('phone');
  const [country] = useState(COUNTRY_OPTIONS[0]);
  const [phoneLocal, setPhoneLocal] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const buildPhonePayload = useCallback(() => {
    const digits = String(phoneLocal || '').replace(/\D/g, '');
    return { phone: `${country.dial}${digits}`, country: country.code };
  }, [country.code, country.dial, phoneLocal]);

  const sendOtp = useCallback(
    async (isResend = false) => {
      setError('');
      const digits = String(phoneLocal || '').replace(/\D/g, '');
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setError('Enter a valid 10-digit Indian mobile number');
        return;
      }
      setBusy(true);
      try {
        const payload = buildPhonePayload();
        const data = await sendPhoneOtp(payload);
        setPhoneE164(data.phone || payload.phone);
        setMasked(data.masked || maskPhoneDisplay(payload.phone));
        setStep('otp');
        setCode('');
        setResendIn(RESEND_COOLDOWN_SEC);
        if (isResend) setError('');
      } catch (e) {
        setError(e.message || 'Could not send OTP');
      } finally {
        setBusy(false);
      }
    },
    [buildPhonePayload, phoneLocal, sendPhoneOtp]
  );

  const verify = async () => {
    setError('');
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    try {
      await verifyPhoneOtp({ phone: phoneE164, code, country: country.code });
    } catch (e) {
      const msg = e.message || 'Verification failed';
      if (/expired/i.test(msg)) setError('Code expired. Tap Resend OTP for a new code.');
      else if (/incorrect|invalid/i.test(msg)) setError('Incorrect code. Please try again.');
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CreamHeader
        title={step === 'phone' ? 'Phone sign in' : 'Verify code'}
        navigation={navigation}
        hideRight
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <AuthCard>
          {step === 'phone' ? (
            <>
              <Text style={styles.title}>Continue with Phone</Text>
              <Text style={styles.sub}>We will send a one-time code by SMS.</Text>
              <ErrorBanner message={error} />
              <View style={styles.phoneRow}>
                <View style={styles.countryBox}>
                  <Text style={styles.countryText}>{country.dial}</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phoneLocal}
                  onChangeText={(t) => setPhoneLocal(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="phone-pad"
                  placeholder="9876543210"
                  placeholderTextColor={colors.textMuted}
                  maxLength={10}
                  editable={!busy}
                />
              </View>
              <GoldButton title={busy ? 'Sending…' : 'Send OTP'} onPress={() => sendOtp(false)} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={styles.title}>Enter verification code</Text>
              <Text style={styles.sub}>
                We sent a code to{'\n'}
                {masked || maskPhoneDisplay(phoneE164)}
              </Text>
              <ErrorBanner message={error} />
              <OtpBoxes value={code} onChange={setCode} disabled={busy} />
              <GoldButton title={busy ? 'Verifying…' : 'Verify'} onPress={verify} disabled={busy} />
              <View style={{ height: 12 }} />
              <Pressable
                onPress={() => sendOtp(true)}
                disabled={busy || resendIn > 0}
                style={{ opacity: busy || resendIn > 0 ? 0.5 : 1 }}
              >
                <Text style={styles.resend}>
                  {resendIn > 0 ? `Resend OTP in ${resendIn}s` : 'Resend OTP'}
                </Text>
              </Pressable>
              <View style={{ height: 8 }} />
              <OutlineButton
                title="Change number"
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setError('');
                }}
                disabled={busy}
              />
            </>
          )}
        </AuthCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.creamBg },
  scroll: { padding: 16, paddingTop: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  sub: { color: colors.textSecondary, marginBottom: 16, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  countryBox: {
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: '#fff',
    minWidth: 72,
  },
  countryText: { fontWeight: '700', color: colors.textPrimary, fontSize: 16 },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.35)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.textPrimary,
  },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 6 },
  otpBox: {
    flex: 1,
    maxWidth: 48,
    height: 52,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.4)',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    backgroundColor: '#fff',
    color: colors.textPrimary,
  },
  resend: { textAlign: 'center', color: colors.gold600, fontWeight: '700', fontSize: 14 },
});
