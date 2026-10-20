import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';

import { GlossyFill, Shine } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { BrandGradient, Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { formatDayLabel, bangkokDay, deviceZone } from '@/lib/bangkok-time';
import { isSafeLink, openLink } from '@/lib/links';
import { cityDealLinks, reportTravelDeal, type Reward, type TravelDeal, type TravelDealCategory } from '@/lib/rewards';
import { makeStyles, useColors } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

const CATEGORY_EMOJI: Record<TravelDealCategory, string> = {
  activity: '🎟️',
  hotel: '🏨',
  flight: '✈️',
  cruise: '🛳️',
  other: '🧳',
};

// The host's reward for a table / hangout that ended with 4+ people: the founder's coupons for that city, country
// or everywhere, then "Find deals in {city}" buttons to official deal pages. `example`: the sample card on My rewards
// (marked as an example; reporting does nothing).
export function RewardCard({
  reward,
  onChanged,
  example = false,
}: {
  reward: Reward;
  onChanged: () => void;
  example?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const city =
    reward.city ||
    (language === 'th' ? reward.venue_name_th || reward.place_name_th : reward.venue_name_en || reward.place_name_en) ||
    reward.place_name ||
    '';

  return (
    <View style={styles.card}>
      <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Shine onColor />
        <Text style={styles.headerEmoji}>🎁</Text>
        <View style={styles.flex}>
          {example && <Text style={styles.exampleTag}>{t('rewards.exampleTag')}</Text>}
          <Text style={styles.headerTitle}>{t('rewards.unlocked', { city: city || t('rewards.thisCity') })}</Text>
          <Text style={styles.headerBody}>{t('rewards.why', { count: reward.member_count })}</Text>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {reward.deals.length > 0 ? (
          reward.deals.map((deal) => <DealRow key={deal.id} deal={deal} example={example} onReported={onChanged} />)
        ) : (
          <Text style={styles.muted}>{t('rewards.noCoupons', { city: city || t('rewards.thisCity') })}</Text>
        )}

        {city ? (
          <View style={styles.findBox}>
            <Text style={styles.findTitle}>{t('rewards.findMore', { city })}</Text>
            <View style={styles.findGrid}>
              {cityDealLinks(city).map((link) => (
                <Pressable
                  key={link.key}
                  accessibilityRole="link"
                  accessibilityLabel={`${t(`rewards.category.${link.category}`)}: ${link.brand}`}
                  onPress={() => openLink(link.url)}
                  style={({ pressed }) => [styles.findButton, pressed && styles.pressed]}>
                  <GlossyFill />
                  <Text style={styles.findEmoji}>{CATEGORY_EMOJI[link.category]}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.findCategory} numberOfLines={1}>
                      {t(`rewards.category.${link.category}`)}
                    </Text>
                    <Text style={styles.findBrand} numberOfLines={1}>
                      {link.brand}
                    </Text>
                  </View>
                  <Icon name="website" size={16} color={Colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function DealRow({ deal, example, onReported }: { deal: TravelDeal; example: boolean; onReported: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [copied, setCopied] = useState(false);
  const details = localized(deal, 'details', language);

  async function copy() {
    if (!deal.code) return;
    await Clipboard.setStringAsync(deal.code);
    setCopied(true);
  }

  function report() {
    if (example) {
      Alert.alert(t('rewards.exampleReport'));
      return;
    }
    Alert.alert(t('rewards.reportTitle'), t('rewards.reportBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('rewards.report'),
        style: 'destructive',
        onPress: async () => {
          await reportTravelDeal(deal.id);
          onReported();
        },
      },
    ]);
  }

  return (
    <View style={styles.deal}>
      <GlossyFill />
      <View style={styles.dealTop}>
        <Text style={styles.dealEmoji}>{CATEGORY_EMOJI[deal.category]}</Text>
        <View style={styles.flex}>
          <Text style={styles.dealBrand}>
            {deal.brand} · {t(`rewards.category.${deal.category}`)}
          </Text>
          <Text style={styles.dealTitle}>{localized(deal, 'title', language)}</Text>
          {details ? <Text style={styles.muted}>{details}</Text> : null}
        </View>
      </View>

      {deal.code && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('rewards.copyCode', { code: deal.code })}
          onPress={copy}
          style={({ pressed }) => [styles.codeBox, pressed && styles.pressed]}>
          <Text style={styles.code} selectable>
            {deal.code}
          </Text>
          <View style={styles.copyPill}>
            <Icon name={copied ? 'check' : 'deal'} size={14} color={Colors.onBrand} />
            <Text style={styles.copyText}>{copied ? t('rewards.copied') : t('rewards.copy')}</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.dealActions}>
        {isSafeLink(deal.url) && (
          <Pressable
            accessibilityRole="link"
            onPress={() => openLink(deal.url)}
            style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}>
            <Shine onColor />
            <Text style={styles.openText}>{t('rewards.openDeal')}</Text>
            <Icon name="website" size={16} color={Colors.white} />
          </Pressable>
        )}
        <View style={styles.flex}>
          {deal.ends_at && (
            <Text style={styles.until}>
              {t('rewards.until', {
                date: formatDayLabel(bangkokDay(new Date(deal.ends_at), deviceZone()), t, undefined, deviceZone()),
              })}
            </Text>
          )}
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={report}>
          <Text style={styles.reportLink}>{t('rewards.didntWork')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  card: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, overflow: 'hidden' },
  headerEmoji: { fontSize: 34 },
  exampleTag: {
    alignSelf: 'flex-start',
    ...Type.small,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.onBrand,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginBottom: 2,
  },
  headerTitle: { ...Type.heading, color: Colors.onBrand, fontWeight: '800' },
  headerBody: { ...Type.small, color: Colors.onBrand },
  body: { padding: Spacing.md, gap: Spacing.md },
  muted: { ...Type.small, color: Colors.textSecondary },
  deal: {
    padding: Spacing.md,
    gap: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  dealTop: { flexDirection: 'row', gap: Spacing.sm },
  dealEmoji: { fontSize: 24 },
  dealBrand: { ...Type.small, fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  dealTitle: { ...Type.label, color: Colors.text, fontWeight: '800' },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
    backgroundColor: Colors.orangeTint,
  },
  code: { fontFamily: 'monospace', fontSize: 18, fontWeight: '800', letterSpacing: 1, color: Colors.glow, flexShrink: 1 },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    minHeight: 30,
    borderRadius: Radius.pill,
    backgroundColor: Colors.orange,
  },
  copyText: { ...Type.small, fontWeight: '800', color: Colors.onBrand },
  dealActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 38,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.violet,
    overflow: 'hidden',
  },
  openText: { ...Type.label, color: Colors.white, fontWeight: '800' },
  until: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  reportLink: { ...Type.small, fontSize: 12, color: Colors.textMuted, textDecorationLine: 'underline' },
  findBox: { gap: Spacing.sm },
  findTitle: { ...Type.label, color: Colors.text },
  findGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  findButton: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  findEmoji: { fontSize: 20 },
  findCategory: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  findBrand: { ...Type.label, color: Colors.text },
}));
