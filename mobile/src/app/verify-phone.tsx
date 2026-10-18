import type { AuthError } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FormInput } from '@/components/form-parts';
import { Icon } from '@/components/icon';
import { LanguageToggle } from '@/components/language-toggle';
import { Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { formatPhone, toE164 } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { makeStyles, useColors } from '@/lib/theme';

const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;

// Second step after Google sign-in: add a phone number to the account and confirm it with an SMS code.
export default function VerifyPhoneScreen() {
  const styles = useStyles();
  const Colors = useColors();
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
    if (!sentTo || code.length !== CODE_LENGTH) return;
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
            <Text style={styles.topTitle}>{t('phone.header')}</Text>
            <LanguageToggle />
          </View>

          <View style={styles.smsIcon}>
            <Icon name="sms" size={32} color={Colors.violetText} />
          </View>
          <View style={styles.titles}>
            <Text style={styles.title}>{sentTo ? t('phone.codeTitle') : t('phone.title')}</Text>
            <Text style={styles.subtitle}>
              {sentTo ? (
                <>
                  {t('phone.codeSentPrefix')}
                  <Text style={styles.phone}>{formatPhone(sentTo)}</Text>
                  {' · '}
                  <Text
                    accessibilityRole="button"
                    style={styles.change}
                    onPress={() => {
                      if (busy) return;
                      setSentTo(null);
                      setError(null);
                    }}>
                    {t('phone.changeNumber')}
                  </Text>
                </>
              ) : (
                t('phone.subtitle')
              )}
            </Text>
          </View>

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}

          {sentTo === null ? (
            <View style={styles.form}>
              <Text style={styles.label}>{t('phone.phoneLabel')}</Text>
              <FormInput
                icon="phone"
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder={t('phone.phonePlaceholder')}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={handleSend}
                autoFocus
                style={styles.phoneInput}
              />
              <Text style={styles.hint}>{t('phone.phoneHint')}</Text>
            </View>
          ) : (
            <View style={styles.form}>
              {/* Six boxes; the real input lies invisibly on top so typing and SMS autofill work. */}
              <View style={styles.boxes}>
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <View
                    key={i}
                    style={[styles.box, i === code.length && styles.boxActive, i < code.length && styles.boxFilled]}>
                    <Text style={styles.digit}>{code[i] ?? ''}</Text>
                  </View>
                ))}
                <TextInput
                  value={code}
                  onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                  keyboardType="number-pad"
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  maxLength={CODE_LENGTH}
                  caretHidden
                  autoFocus
                  accessibilityLabel={t('phone.codeLabel')}
                  style={styles.hiddenInput}
                />
              </View>
              <View style={styles.resendRow}>
                <Icon name="timer" size={18} color={Colors.textMuted} />
                {resendIn > 0 ? (
                  <Text style={styles.resendText}>
                    {t('phone.resendInPrefix')}
                    <Text style={styles.resendTime}>{`0:${String(resendIn).padStart(2, '0')}`}</Text>
                  </Text>
                ) : (
                  <Text
                    accessibilityRole="button"
                    style={[styles.resendText, styles.change]}
                    onPress={() => !busy && sendCode(sentTo)}>
                    {t('phone.resend')}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.grow} />
          <Button
            title={sentTo ? t('phone.verify') : t('phone.sendCode')}
            onPress={sentTo ? handleVerify : handleSend}
            loading={busy}
            disabled={sentTo ? code.length !== CODE_LENGTH : !phoneInput.trim()}
          />
          <Button title={t('phone.useDifferentAccount')} variant="text" onPress={signOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: Spacing.lg, gap: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.sm },
  topTitle: { ...Type.label, fontSize: 15, color: Colors.textSecondary },
  smsIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violetTint,
  },
  titles: { gap: Spacing.sm },
  title: { ...Type.display, color: Colors.text },
  subtitle: { ...Type.body, color: Colors.textSecondary },
  phone: { color: Colors.text, fontWeight: '800' },
  change: { color: Colors.accent, fontWeight: '800' },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  form: { gap: Spacing.md },
  label: { ...Type.label, color: Colors.textSecondary },
  phoneInput: { fontSize: 18 },
  hint: { ...Type.small, color: Colors.textMuted },
  boxes: { flexDirection: 'row', gap: Spacing.sm },
  box: {
    flex: 1,
    height: 60,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: Colors.orange },
  boxFilled: { borderColor: Colors.borderStrong },
  digit: { fontFamily: Fonts.heading, fontSize: 24, fontWeight: '800', color: Colors.text },
  hiddenInput: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0, color: 'transparent' },
  resendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  resendText: { ...Type.label, fontWeight: '600', color: Colors.textMuted },
  resendTime: { color: Colors.text, fontWeight: '800' },
  grow: { flexGrow: 1 },
}));
