import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { QrCode } from '@/components/qr-code';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { bangkokMinutes, formatClock } from '@/lib/bangkok-time';
import {
  checkIn,
  redemptionUrl,
  requestQr,
  useCouponState,
  useVenueDistance,
  type CouponDeal,
  type CouponErrorKey,
} from '@/lib/coupons';
import { makeStyles, useColors } from '@/lib/theme';

// Group coupon on a table / hangout at a partner venue (members only): check in at the venue, then show the QR to
// the staff once enough members are checked in.
export function CouponBox({ meetupId, timeZone }: { meetupId: string; timeZone: string }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { state, reload } = useCouponState(meetupId, true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CouponErrorKey | null>(null);
  const watching = Boolean(state?.window_open && !state.me_checked_in && state.deals.length > 0);
  const distance = useVenueDistance(state?.venue ?? null, watching);

  if (!state || state.deals.length === 0) return null;

  const radius = state.venue?.radius_m ?? 50;
  // The most anyone needs (3 for a discount / offer, 1 for a ticket discount).
  const needed = Math.max(...state.deals.map((deal) => deal.needed));

  async function act(key: string, action: () => Promise<CouponErrorKey | null>) {
    setError(null);
    setBusy(key);
    const problem = await action();
    setBusy(null);
    if (problem) setError(problem);
    await reload();
  }

  return (
    <View style={styles.box}>
      <GlossyFill />
      <View style={styles.header}>
        <Text style={styles.emoji}>🎟️</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('coupon.title')}</Text>
          <Text style={styles.progress}>{t('coupon.progress', { count: state.checked_in, needed })}</Text>
        </View>
      </View>
      <View style={styles.dots}>
        {Array.from({ length: needed }, (_, index) => (
          <View key={index} style={[styles.dot, index < state.checked_in && styles.dotOn]} />
        ))}
      </View>

      {!state.window_open ? (
        <Text style={styles.note}>{t('coupon.opensSoon')}</Text>
      ) : state.me_checked_in ? (
        <View style={styles.checkedIn}>
          <Icon name="check" size={18} color={Colors.accent} />
          <Text style={styles.checkedInText}>{t('coupon.checkedIn')}</Text>
        </View>
      ) : distance.state.status === 'denied' ? (
        <View style={styles.gap}>
          <Text style={styles.note}>{t('coupon.locationNeeded')}</Text>
          <Button title={t('coupon.allowLocation')} variant="secondary" onPress={distance.ask} />
        </View>
      ) : distance.state.status === 'ready' && distance.state.meters <= radius ? (
        <Button
          title={t('coupon.checkIn')}
          icon={<Icon name="location" size={20} color={Colors.onBrand} />}
          loading={busy === 'checkin'}
          onPress={() => act('checkin', () => checkIn(meetupId))}
        />
      ) : (
        <Text style={styles.note}>
          {distance.state.status === 'ready'
            ? t('coupon.tooFar', { distance: formatDistance(distance.state.meters), radius })
            : t('coupon.locating')}
        </Text>
      )}

      {state.deals.map((deal) => (
        <DealRow
          key={deal.id}
          deal={deal}
          checkedIn={state.checked_in}
          meCheckedIn={state.me_checked_in}
          windowOpen={state.window_open}
          timeZone={timeZone}
          busy={busy === deal.id}
          onRequest={() => act(deal.id, () => requestQr(meetupId, deal.id))}
          onExpired={reload}
        />
      ))}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {t(`coupon.errors.${error}`, { radius })}
        </Text>
      )}
    </View>
  );
}

function DealRow({
  deal,
  checkedIn,
  meCheckedIn,
  windowOpen,
  timeZone,
  busy,
  onRequest,
  onExpired,
}: {
  deal: CouponDeal;
  checkedIn: number;
  meCheckedIn: boolean;
  windowOpen: boolean;
  timeZone: string;
  busy: boolean;
  onRequest: () => void;
  onExpired: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = currentLanguage();
  const title = localized(deal, 'title', language);
  const missing = Math.max(0, deal.needed - checkedIn);
  const url = deal.qr_token ? redemptionUrl(deal.qr_token) : null;

  return (
    <View style={styles.deal}>
      <Text style={styles.dealTitle}>
        {deal.kind === 'ticket' ? '🎫' : '🏷️'} {title}
      </Text>
      {deal.redeemed_at ? (
        <Text style={styles.done}>
          {t('coupon.redeemed', { time: formatClock(bangkokMinutes(new Date(deal.redeemed_at), timeZone)) })}
        </Text>
      ) : missing > 0 ? (
        <Text style={styles.note}>{t('coupon.needMore', { count: missing })}</Text>
      ) : !windowOpen || !meCheckedIn ? (
        <Text style={styles.note}>{t('coupon.unlockedCheckIn')}</Text>
      ) : deal.qr_token && deal.qr_expires_at ? (
        url ? (
          <QrPanel url={url} expiresAt={deal.qr_expires_at} onExpired={onExpired} />
        ) : (
          <Text style={styles.error}>{t('coupon.notSetUp')}</Text>
        )
      ) : (
        <Button
          title={t('coupon.showQr')}
          icon={<Icon name="deal" size={20} color="#FFFFFF" />}
          variant="violet"
          loading={busy}
          onPress={onRequest}
        />
      )}
    </View>
  );
}

function QrPanel({ url, expiresAt, onExpired }: { url: string; expiresAt: string; onExpired: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, new Date(expiresAt).getTime() - now);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= new Date(expiresAt).getTime()) {
        clearInterval(timer);
        onExpired();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);

  return (
    <View style={styles.qrPanel}>
      <QrCode value={url} size={232} />
      <Text style={styles.qrHint}>{t('coupon.qrHint')}</Text>
      <Text style={styles.countdown}>
        {t('coupon.expiresIn', { time: `${minutes}:${String(seconds).padStart(2, '0')}` })}
      </Text>
    </View>
  );
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const useStyles = makeStyles((Colors) => ({
  box: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  emoji: { fontSize: 28 },
  headerText: { flex: 1 },
  title: { ...Type.heading, color: Colors.text },
  progress: { ...Type.small, color: Colors.textSecondary },
  dots: { flexDirection: 'row', gap: Spacing.sm },
  dot: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.borderStrong },
  dotOn: { backgroundColor: Colors.orange },
  gap: { gap: Spacing.sm },
  note: { ...Type.small, color: Colors.textSecondary },
  checkedIn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkedInText: { ...Type.body, color: Colors.text, fontWeight: '600' },
  deal: { gap: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  dealTitle: { ...Type.body, color: Colors.text, fontWeight: '600' },
  done: { ...Type.body, color: Colors.accent, fontWeight: '600' },
  qrPanel: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  qrHint: { ...Type.small, color: Colors.textSecondary, textAlign: 'center' },
  countdown: { ...Type.body, color: Colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
  },
}));
