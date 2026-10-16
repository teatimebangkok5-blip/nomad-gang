import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { planShareText } from '@/components/plan-timeline';
import { MakeHangoutBox, PlanView } from '@/components/plan-view';
import { ScreenHeader } from '@/components/screen-header';
import { Spacing, Type } from '@/constants/theme';
import { currentLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatClock, formatDayLabel } from '@/lib/bangkok-time';
import { deletePlan, makePlanHangout, planDay, planHangoutError, usePlan } from '@/lib/plans';
import { makeStyles, useColors } from '@/lib/theme';

// A saved day plan (from "My plans"): the map and timeline, share, make it a day hangout (once) or open it, delete.
export default function PlanScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const language = currentLanguage();
  const { session } = useAuth();
  const plan = usePlan(id);
  const [working, setWorking] = useState(false);

  if (plan === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('plan.dayPlan')} />
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      </SafeAreaView>
    );
  }

  if (plan === 'missing') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('plan.dayPlan')} />
        <View style={styles.center}>
          <Icon name="error" size={40} color={Colors.textMuted} />
          <Text style={styles.centerText}>{t('plan.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = plan.owner_id === session?.user.id;
  const dayLabel = formatDayLabel(planDay(plan.day), t);

  async function makeHangout(people: number) {
    setWorking(true);
    const { meetupId, error } = await makePlanHangout(id, people);
    setWorking(false);
    if (error || !meetupId) return Alert.alert(planHangoutError(error, t));
    router.replace({ pathname: '/table/[id]', params: { id: meetupId } });
  }

  function confirmDelete() {
    Alert.alert(t('plan.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('plan.delete'),
        style: 'destructive',
        onPress: async () => {
          if (await deletePlan(id)) router.back();
          else Alert.alert(t('plan.errors.generic'));
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={t('plan.dayPlan')}
        right={
          isOwner ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('plan.delete')}
              hitSlop={8}
              onPress={confirmDelete}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <Icon name="delete" size={22} color={Colors.textSecondary} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{plan.title}</Text>
        <Text style={styles.muted}>
          {dayLabel} · {formatClock(plan.start_minutes)}–{formatClock(plan.end_minutes)}
        </Text>

        <View style={styles.planWrap}>
          <PlanView start={null} stops={plan.stops} />
        </View>

        <View style={styles.actions}>
          <Button
            title={t('plan.share')}
            variant="secondary"
            onPress={() => Share.share({ message: planShareText(plan.title, dayLabel, plan.stops, t, language) })}
          />
          {plan.meetup_id && (
            <Button
              title={t('plan.openHangout')}
              variant="violet"
              icon={<Icon name="hangout" size={20} color={Colors.white} />}
              onPress={() => router.push({ pathname: '/table/[id]', params: { id: plan.meetup_id as string } })}
            />
          )}
        </View>

        {isOwner && !plan.meetup_id && <MakeHangoutBox loading={working} onMake={makeHangout} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  title: { ...Type.display, fontSize: 26, lineHeight: 32, color: Colors.text },
  muted: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.xs },
  planWrap: { marginTop: Spacing.lg },
  actions: { gap: Spacing.sm, marginTop: Spacing.xl },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
}));
