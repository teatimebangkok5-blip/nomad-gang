import type { AuthError } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LanguageToggle } from '@/components/language-toggle';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { formatPhone, toE164 } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

const RESEND_SECONDS = 60;

// Second step after Google sign-in: add a phone number to the account and confirm it with an SMS code.
export default function VerifyPhoneScreen() {
  const { t } = useTranslation();
  const [phoneInput, setPhoneInput] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function messageFor(authError: AuthError, fallback: string) {
    switch (authError.code) {
      case 'phone_exists':
        return t('phone.errorPhoneTaken');
      case 'otp_expired':
        return t('phone.errorInvalidCode');
      case 'over_sms_send_rate_limit':
      case 'over_request_rate_limit':
        return t('phone.errorTooMany');
      default:
        return fallback;
    }
  }

  async function sendCode(phone: string) {
    setError(null);
    setBusy(true);
    // Sends an SMS code to the new number; it's attached to the account once verified.
    const { error: sendError } = await supabase.auth.updateUser({ phone });
    setBusy(false);
    if (sendError) {
      setError(messageFor(sendError, t('phone.errorSend')));
      return;
    }
    setSentTo(phone);
    setCode('');
    setResendIn(RESEND_SECONDS);
  }

  function handleSend() {
    const phone = toE164(phoneInput);
    if (!phone) {
      setError(t('phone.errorInvalidPhone'));
      return;
    }
    sendCode(phone);
  }

  async function handleVerify() {
    if (!sentTo || code.length !== 6) return;
    setError(null);
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone: sentTo, token: code, type: 'phone_change' });
    setBusy(false);
    // On success the session updates and the root layout opens the home screen.
    if (verifyError) setError(messageFor(verifyError, t('phone.errorInvalidCode')));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Button title={t('phone.useDifferentAccount')} variant="text" onPress={signOut} />
            <LanguageToggle />
          </View>

          <Text style={styles.title}>{t('phone.title')}</Text>
          <Text style={styles.subtitle}>
            {sentTo ? t('phone.codeSentTo', { phone: formatPhone(sentTo) }) : t('phone.subtitle')}
          </Text>

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}

          {sentTo === null ? (
            <View style={styles.form}>
              <Text style={styles.label}>{t('phone.phoneLabel')}</Text>
              <TextInput
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder={t('phone.phonePlaceholder')}
                placeholderTextColor={Colors.ink400}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={handleSend}
                autoFocus
                style={styles.input}
              />
              <Text style={styles.hint}>{t('phone.phoneHint')}</Text>
              <Button title={t('phone.sendCode')} onPress={handleSend} loading={busy} disabled={!phoneInput.trim()} />
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>{t('phone.codeLabel')}</Text>
              <TextInput
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                style={[styles.input, styles.codeInput]}
              />
              <Button title={t('phone.verify')} onPress={handleVerify} loading={busy} disabled={code.length !== 6} />
              <View style={styles.row}>
                <Button
                  title={resendIn > 0 ? t('phone.resendIn', { seconds: resendIn }) : t('phone.resend')}
                  variant="text"
                  disabled={resendIn > 0 || busy}
                  onPress={() => sendCode(sentTo)}
                />
                <Button
                  title={t('phone.changeNumber')}
                  variant="text"
                  disabled={busy}
                  onPress={() => {
                    setSentTo(null);
                    setError(null);
                  }}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.ink50 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    marginHorizontal: -Spacing.md,
    paddingRight: Spacing.md,
  },
  title: { ...Type.title, color: Colors.ink900, marginTop: Spacing.xxl },
  subtitle: { ...Type.body, color: Colors.ink600, marginTop: Spacing.sm },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  form: { marginTop: Spacing.xl, gap: Spacing.md },
  label: { ...Type.label, color: Colors.ink700, marginBottom: -Spacing.xs },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.ink300,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    fontSize: 18,
    color: Colors.ink900,
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  hint: { ...Type.small, color: Colors.ink500, marginTop: -Spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
});
