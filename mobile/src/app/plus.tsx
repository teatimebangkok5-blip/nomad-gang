import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill, ToneFill } from '@/components/glossy';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { legalContact } from '@/lib/legal';
import { usePlus, type PlusPlan } from '@/lib/plus';
import { makeStyles } from '@/lib/theme';

const BENEFITS = [
  { emoji: '🗺️', key: 'planner' },
  { emoji: '💎', key: 'gems' },
  { emoji: '🎫', key: 'passport' },
  { emoji: '🚫', key: 'noAds' },
] as const;

// TableMeet Plus: what it unlocks, monthly or yearly, and how to get it. Payments aren't in the app yet: people ask
// the TableMeet team (email), and the founder turns Plus on in the admin panel. Reaching level 15 (My rewards) gives
// Plus for free.
export default function PlusScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const plus = usePlus();
  const [plan, setPlan] = useState<PlusPlan>('yearly');
  const member = plus.status === 'ready' && plus.member;
  const email = session?.user.email ?? null;

  function contact() {
    if (!legalContact.email) return;
    const subject = encodeURIComponent(t('plus.emailSubject'));
    const body = encodeURIComponent(
      t('plus.emailBody', { plan: t(`plus.plans.${plan}`), account: email ?? session?.user.id ?? '' }),
    );
    Linking.openURL(`mailto:${legalContact.email}?subject=${subject}&body=${body}`);
  }

  const endsLabel =
    plus.status === 'ready' && plus.endsAt
      ? new Date(plus.endsAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium' })
      : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('plus.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ToneFill tone="brand" />
          <Text style={styles.heroTitle}>TableMeet Plus</Text>
          <Text style={styles.heroText}>{member ? t('plus.memberIntro') : t('plus.intro')}</Text>
        </View>

        {member && (
          <View style={styles.card}>
            <GlossyFill />
            <Text style={styles.cardTitle}>{t('plus.active')}</Text>
            <Text style={styles.cardText}>
              {plus.status === 'ready' && plus.plan
                ? t(`plus.plans.${plus.plan}`)
                : plus.status === 'ready' && plus.byLevel
                  ? t('plus.byLevel', { level: plus.level ?? 15 })
                  : t('plus.founder')}
              {endsLabel ? ` · ${t('plus.until', { date: endsLabel })}` : ''}
            </Text>
          </View>
        )}

        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <View key={benefit.key} style={styles.benefit}>
              <Text style={styles.benefitEmoji}>{benefit.emoji}</Text>
              <View style={styles.flex}>
                <Text style={styles.benefitTitle}>{t(`plus.benefits.${benefit.key}.title`)}</Text>
                <Text style={styles.benefitText}>{t(`plus.benefits.${benefit.key}.text`)}</Text>
              </View>
            </View>
          ))}
        </View>

        {!member && (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/rewards')}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <GlossyFill />
              <Text style={styles.cardTitle}>👑 {t('plus.freeTitle', { level: 15 })}</Text>
              <Text style={styles.cardText}>
                {t('plus.freeText', { level: 15, current: plus.status === 'ready' ? (plus.level ?? 1) : 1 })}
              </Text>
              <Text style={styles.freeLink}>{t('plus.freeLink')}</Text>
            </Pressable>

            <Text style={styles.section}>{t('plus.choosePlan')}</Text>
            <View style={styles.plans}>
              {(['monthly', 'yearly'] as const).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: plan === option }}
                  onPress={() => setPlan(option)}
                  style={[styles.plan, plan === option && styles.planSelected]}>
                  <GlossyFill />
                  <Text style={styles.planTitle}>{t(`plus.plans.${option}`)}</Text>
                  <Text style={styles.planText}>{t(`plus.planHints.${option}`)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.how}>{t('plus.how')}</Text>
            {legalContact.email ? (
              <View style={styles.cta}>
                <Button title={t('plus.contact')} onPress={contact} />
              </View>
            ) : (
              <Text style={styles.how}>{t('plus.askTeam')}</Text>
            )}
            {email && <Text style={styles.account}>{t('plus.yourAccount', { email })}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2, gap: Spacing.lg },
  hero: { padding: Spacing.xl, borderRadius: Radius.lg, overflow: 'hidden', gap: Spacing.sm, ...Raised },
  heroTitle: { ...Type.title, color: Colors.onBrand },
  heroText: { ...Type.body, color: Colors.onBrand },
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  cardTitle: { ...Type.heading, color: Colors.text },
  pressed: { opacity: 0.7 },
  freeLink: { ...Type.label, color: Colors.accent, marginTop: Spacing.sm },
  cardText: { ...Type.body, color: Colors.textSecondary, marginTop: Spacing.xs },
  benefits: { gap: Spacing.md },
  benefit: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  benefitEmoji: { fontSize: 26, width: 36, textAlign: 'center' },
  benefitTitle: { ...Type.label, color: Colors.text },
  benefitText: { ...Type.small, color: Colors.textSecondary },
  section: { ...Type.heading, color: Colors.text, marginTop: Spacing.sm },
  plans: { flexDirection: 'row', gap: Spacing.md },
  plan: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    minHeight: 96,
  },
  planSelected: { borderColor: Colors.accent },
  planTitle: { ...Type.heading, color: Colors.text },
  planText: { ...Type.small, color: Colors.textSecondary, marginTop: Spacing.xs },
  how: { ...Type.body, color: Colors.textSecondary },
  cta: { marginTop: Spacing.xs },
  account: { ...Type.small, color: Colors.textMuted },
}));
