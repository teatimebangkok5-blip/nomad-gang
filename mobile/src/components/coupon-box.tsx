import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { QrCode } from '@/components/qr-code';
import { Fonts, Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { bangkokMinutes, formatClock } from '@/lib/bangkok-time';
import {
  checkIn,
  COUPONS_ENABLED,
  redemptionUrl,
  requestQr,
  useCouponState,
  useVenueDistance,
  type CouponDeal,
  type CouponErrorKey,
  type CouponState,
} from '@/lib/coupons';
import { confirmCompletionCode, PASSPORT_PEOPLE, startCompletionCode, type CompletionErrorKey } from '@/lib/passport';
import { makeStyles, useColors } from '@/lib/theme';

// Check-in box on a table / hangout (members only): check in at the place by GPS, which counts the meetup in the
// Rewards Passport (4+ checked in) and unlocks a partner venue's coupon (3+, or 1 for a ticket discount). When GPS
// doesn't work, the host's completion code is the backup (the founder reviews those). After the end it shows
// whether the meetup counted.
export function CouponBox({
  meetupId,
  timeZone,
  isHost,
  ended,
}: {
  meetupId: string;
  timeZone: string;
  isHost: boolean;
  ended: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { state, reload } = useCouponState(meetupId, true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watching = Boolean(state?.window_open && !state.me_checked_in);
  const distance = useVenueDistance(state?.venue ?? null, watching);

  if (!state) return null;

  const radius = state.venue?.radius_m ?? 50;
  const deals = COUPONS_ENABLED ? state.deals : [];
  const needed = Math.max(PASSPORT_PEOPLE, ...deals.map((deal) => deal.needed));
  const passport = state.passport;

  async function act(key: string, action: () => Promise<string | null>) {
    setError(null);
    setBusy(key);
    const problem = await action();
    setBusy(null);
    if (problem) setError(problem);
    await reload();
  }

  const firstDeal = deals[0];

  return (
    // Brand-gradient frame around the box.
    <View style={styles.frame}>
      <ToneFill tone="brand" shine={false} />
      <View style={styles.box}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🎟️</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('coupon.title')}</Text>
          {firstDeal && <Text style={styles.dealLine}>{localized(firstDeal, 'title', language)}</Text>}
        </View>
      </View>
      <View style={styles.dots}>
        {Array.from({ length: needed }, (_, index) => (
          <View key={index} style={[styles.dot, index < state.checked_in && styles.dotOn]}>
            {index < state.checked_in && <ToneFill tone="brand" shine={false} />}
          </View>
        ))}
      </View>
      <Text style={styles.progress}>
        {t('coupon.progress', { count: state.checked_in, needed })} · {t('passport.checkInWhy', { count: PASSPORT_PEOPLE })}
      </Text>

      {ended ? null : !state.window_open ? (
        <Text style={styles.note}>{t('coupon.opensSoon')}</Text>
      ) : state.me_checked_in ? (
        <View style={styles.checkedIn}>
          <Icon name="checkIn" size={20} color={Colors.ok} />
          <Text style={styles.checkedInText}>{t('coupon.checkedIn')}</Text>
        </View>
      ) : distance.state.status === 'denied' ? (
        <View style={styles.gap}>
          <Text style={styles.note}>{t('coupon.locationNeeded')}</Text>
          <Button title={t('coupon.allowLocation')} variant="secondary" onPress={distance.ask} />
        </View>
      ) : distance.state.status === 'ready' && distance.state.meters <= radius ? (
        <View style={styles.gap}>
          <Button
            title={t('coupon.checkIn')}
            icon={<Icon name="checkIn" size={22} color={Colors.onBrand} />}
            loading={busy === 'checkin'}
            onPress={() => act('checkin', () => checkIn(meetupId))}
          />
          <View style={styles.near}>
            <Icon name="myLocation" size={16} color={Colors.ok} />
            <Text style={styles.nearText}>{t('coupon.closeEnough', { distance: formatDistance(distance.state.meters) })}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.note}>
          {distance.state.status === 'ready'
            ? t('coupon.tooFar', { distance: formatDistance(distance.state.meters), radius })
            : t('coupon.locating')}
        </Text>
      )}

      {!ended &&
        deals.map((deal) => (
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

      <PassportPart
        passport={passport}
        checkedIn={state.checked_in}
        isHost={isHost}
        ended={ended}
        busy={busy}
        onStartCode={() => act('code', () => startCompletionCode(meetupId))}
        onConfirmCode={(code) => act('confirm', () => confirmCompletionCode(meetupId, code))}
      />

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error in CODE_ERROR_KEYS ? t(`passport.errors.${error as CompletionErrorKey}`) : t(`coupon.errors.${error as CouponErrorKey}`, { radius })}
        </Text>
      )}
      </View>
    </View>
  );
}

const CODE_ERROR_KEYS: Record<CompletionErrorKey, true> = {
  not_host: true,
  not_member: true,
  meetup_cancelled: true,
  not_started: true,
  too_late: true,
  no_code: true,
  too_many_attempts: true,
  wrong_code: true,
  generic: true,
};

// Whether the meetup counts in the Rewards Passport, and the host-code backup.
function PassportPart({
  passport,
  checkedIn,
  isHost,
  ended,
  busy,
  onStartCode,
  onConfirmCode,
}: {
  passport: CouponState['passport'];
  checkedIn: number;
  isHost: boolean;
  ended: boolean;
  busy: string | null;
  onStartCode: () => void;
  onConfirmCode: (code: string) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [showCode, setShowCode] = useState(false);
  const [typed, setTyped] = useState('');

  if (!passport) return null;

  if (passport.verified) {
    return (
      <Pressable accessibilityRole="button" onPress={() => router.push('/passport')} style={styles.section}>
        <Text style={styles.done}>{t('passport.verified')}</Text>
        <Text style={styles.link}>{t('passport.openPassport')}</Text>
      </Pressable>
    );
  }
  if (passport.code_status === 'pending') {
    return (
      <View style={styles.section}>
        <Text style={styles.note}>{t('passport.pendingReview')}</Text>
      </View>
    );
  }

  const gpsEnough = checkedIn >= PASSPORT_PEOPLE;
  const codeUsable = passport.code_open && passport.code_status !== 'rejected' && !gpsEnough;

  return (
    <View style={styles.section}>
      <View style={styles.passportHeader}>
        <Text style={styles.passportEmoji}>🛂</Text>
        <Text style={styles.passportTitle}>{t('passport.title')}</Text>
      </View>
      {ended && !codeUsable && (
        <Text style={styles.note}>
          {passport.code_status === 'rejected' ? t('passport.rejected') : t('passport.notCounted', { count: PASSPORT_PEOPLE })}
        </Text>
      )}
      {codeUsable && !showCode && !passport.code && !passport.me_confirmed && (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => setShowCode(true)}>
          <Text style={styles.link}>{t('passport.gpsNotWorking')}</Text>
        </Pressable>
      )}
      {codeUsable && (showCode || passport.code || passport.me_confirmed) && (
        <View style={styles.gap}>
          <Text style={styles.note}>{t('passport.codeExplain', { count: PASSPORT_PEOPLE })}</Text>
          {isHost ? (
            passport.code ? (
              <>
                <Text style={styles.code} accessibilityLabel={passport.code.split('').join(' ')}>
                  {passport.code}
                </Text>
                <Text style={styles.note}>
                  {t('passport.codeConfirmed', { count: passport.confirmations, needed: PASSPORT_PEOPLE })}
                </Text>
              </>
            ) : (
              <Button title={t('passport.showCode')} variant="secondary" loading={busy === 'code'} onPress={onStartCode} />
            )
          ) : passport.me_confirmed ? (
            <Text style={styles.done}>
              {t('passport.youConfirmed', { count: passport.confirmations, needed: PASSPORT_PEOPLE })}
            </Text>
          ) : (
            <View style={styles.codeRow}>
              <CodeInput value={typed} onChange={setTyped} />
              <Button
                title={t('passport.confirm')}
                variant="secondary"
                compact
                loading={busy === 'confirm'}
                disabled={typed.length !== 6}
                onPress={() => onConfirmCode(typed)}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChange(text.replace(/[^0-9]/g, '').slice(0, 6))}
      placeholder="123456"
      accessibilityLabel={t('passport.codeLabel')}
      placeholderTextColor={Colors.textMuted}
      keyboardType="number-pad"
      maxLength={6}
      selectionColor={Colors.orange}
      keyboardAppearance="dark"
      style={styles.codeInput}
    />
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
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const title = localized(deal, 'title', language);
  const missing = Math.max(0, deal.needed - checkedIn);
  const url = deal.qr_token ? redemptionUrl(deal.qr_token) : null;

  return (
    <View style={styles.section}>
      {!deal.qr_token && (
        <Text style={styles.dealTitle}>
          {deal.kind === 'ticket' ? '🎟️' : '🏷️'} {title}
        </Text>
      )}
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
          <QrPanel url={url} title={title} expiresAt={deal.qr_expires_at} onExpired={onExpired} />
        ) : (
          <Text style={styles.error}>{t('coupon.notSetUp')}</Text>
        )
      ) : (
        <Button
          title={t('coupon.showQr')}
          icon={<Icon name="deal" size={20} color={Colors.white} />}
          variant="violet"
          loading={busy}
          onPress={onRequest}
        />
      )}
    </View>
  );
}

function QrPanel({
  url,
  title,
  expiresAt,
  onExpired,
}: {
  url: string;
  title: string;
  expiresAt: string;
  onExpired: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
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
      <View style={styles.unlocked}>
        <Icon name="lockOpen" size={18} color={Colors.ok} />
        <Text style={styles.unlockedText}>{t('coupon.unlocked')}</Text>
      </View>
      <Text style={styles.qrTitle}>{title}</Text>
      <View style={styles.qrFrame}>
        <QrCode value={url} size={200} />
      </View>
      <View style={styles.countdown}>
        <Icon name="timer" size={20} color={Colors.accent} />
        <Text style={styles.countdownText}>
          {t('coupon.expiresIn', { time: `${minutes}:${String(seconds).padStart(2, '0')}` })}
        </Text>
      </View>
      <Text style={styles.qrShow}>{t('coupon.showStaff')}</Text>
      <Text style={styles.qrHint}>{t('coupon.qrHint')}</Text>
    </View>
  );
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const useStyles = makeStyles((Colors) => ({
  frame: { padding: 2, borderRadius: 24, overflow: 'hidden', ...Raised },
  box: { padding: Spacing.lg - 2, gap: Spacing.md, borderRadius: 22, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md - 2 },
  emoji: { fontSize: 22 },
  headerText: { flex: 1 },
  title: { ...Type.heading, fontWeight: '800', color: Colors.text },
  dealLine: { ...Type.small, fontWeight: '700', color: Colors.accent },
  progress: { ...Type.small, fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.textSecondary },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  dotOn: { borderWidth: 0 },
  gap: { gap: Spacing.sm },
  near: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  nearText: { ...Type.small, fontWeight: '600', color: Colors.ok },
  note: { ...Type.small, color: Colors.textSecondary },
  link: { ...Type.small, color: Colors.accent, fontWeight: '700' },
  checkedIn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkedInText: { ...Type.body, color: Colors.ok, fontWeight: '700' },
  section: { gap: Spacing.sm, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  passportHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  passportEmoji: { fontSize: 20 },
  passportTitle: { ...Type.heading, fontSize: 16, fontWeight: '800', color: Colors.text, flex: 1 },
  dealTitle: { ...Type.body, color: Colors.text, fontWeight: '700' },
  done: { ...Type.body, color: Colors.ok, fontWeight: '700' },
  code: { ...Type.display, color: Colors.text, letterSpacing: 8, textAlign: 'center', fontVariant: ['tabular-nums'] },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  codeInput: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 14,
    backgroundColor: Colors.field,
    paddingHorizontal: Spacing.lg,
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
    color: Colors.text,
  },
  qrPanel: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  unlocked: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unlockedText: { ...Type.label, fontSize: 13, fontWeight: '800', color: Colors.ok },
  qrTitle: { ...Type.title, fontSize: 20, lineHeight: 26, color: Colors.text, textAlign: 'center' },
  qrFrame: { padding: 14, borderRadius: 20, backgroundColor: '#FFFFFF', ...Raised },
  qrShow: { ...Type.body, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  qrHint: { ...Type.small, color: Colors.textSecondary, textAlign: 'center' },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.orangeTint,
  },
  countdownText: { ...Type.body, fontSize: 16, fontWeight: '800', color: Colors.accent, fontVariant: ['tabular-nums'] },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
  },
}));
