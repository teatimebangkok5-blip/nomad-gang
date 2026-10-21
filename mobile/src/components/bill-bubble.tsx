import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chat-avatar';
import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { setBillPaid, useBill } from '@/lib/bills';
import { formatMoney, myCurrency, setMyCurrency, useRates } from '@/lib/currency';
import { makeStyles, useColors } from '@/lib/theme';

// A split bill in the chat: total, who owes the payer what, ✓ paid ticks (each person ticks their own, the payer
// anyone's), and "≈" amounts in my own currency (daily rates; tap to pick another currency).
export function BillBubble({ billId, myId, onLongPress }: { billId: string; myId: string | undefined; onLongPress?: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { state, reload } = useBill(billId);
  const [mine, setMine] = useState(() => myCurrency());
  const rates = useRates(state && state !== 'missing' ? state.bill.currency : null);
  const [busy, setBusy] = useState<string | null>(null);

  if (state === null) {
    return (
      <View style={[styles.bubble, styles.center]}>
        <ActivityIndicator color={Colors.violetText} />
      </View>
    );
  }
  if (state === 'missing') {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>🧾 {t('bill.missing')}</Text>
      </View>
    );
  }

  const { bill, shares } = state;
  const payer = shares.find((share) => share.user_id === bill.payer_id);
  const payerName = bill.payer_id === myId ? t('tables.you') : (payer?.display_name ?? '');
  const convert = mine !== bill.currency && rates?.[mine] ? (amount: number) => amount * (rates[mine] as number) : null;
  const paidCount = shares.filter((share) => share.paid_at).length;
  const extras = [
    bill.discount_pct > 0 ? t('bill.discountShort', { pct: Number(bill.discount_pct) }) : null,
    bill.service_pct > 0 ? t('bill.serviceShort', { pct: Number(bill.service_pct) }) : null,
    bill.vat_pct > 0 ? t('bill.vatShort', { pct: Number(bill.vat_pct) }) : null,
    bill.tip_pct > 0 ? t('bill.tipShort', { pct: Number(bill.tip_pct) }) : null,
  ].filter(Boolean);

  async function toggle(userId: string, paid: boolean) {
    setBusy(userId);
    await setBillPaid(billId, userId, paid);
    setBusy(null);
    reload();
  }

  function pickCurrency() {
    // Android dialogs hold 3 buttons: offer the bill's currency, a few common ones and mine.
    const options = [...new Set([bill.currency, 'THB', 'USD', 'EUR', myCurrency()])].filter((code) => code !== mine).slice(0, 3);
    Alert.alert(
      t('bill.showIn'),
      t('bill.ratesNote'),
      options.map((code) => ({
        text: code,
        onPress: () => {
          setMine(code);
          setMyCurrency(code);
        },
      })),
      { cancelable: true },
    );
  }

  return (
    <Pressable onLongPress={onLongPress} style={styles.bubble}>
      <GlossyFill />
      <View style={styles.head}>
        <View style={styles.receipt}>
          <ToneFill tone="violet" shine={false} />
          <Icon name="receipt" size={18} color={Colors.white} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {bill.title || t('bill.defaultTitle')}
          </Text>
          <Text style={styles.paidBy}>{t('bill.paidBy', { name: payerName })}</Text>
        </View>
      </View>

      <Text style={styles.total}>{formatMoney(bill.total, bill.currency, language)}</Text>
      {convert && <Text style={styles.converted}>≈ {formatMoney(convert(bill.total), mine, language)}</Text>}
      {extras.length > 0 && <Text style={styles.extras}>{extras.join(' · ')}</Text>}

      <View style={styles.shares}>
        {shares.map((share) => {
          const isPayer = share.user_id === bill.payer_id;
          const canTick = !isPayer && (bill.payer_id === myId || share.user_id === myId);
          const paid = Boolean(share.paid_at);
          return (
            <View key={share.user_id} style={styles.share}>
              <ChatAvatar name={share.display_name} photoPath={share.avatar_path} size={26} />
              <View style={styles.flex}>
                <Text style={styles.shareName} numberOfLines={1}>
                  {share.user_id === myId ? t('tables.you') : share.display_name}
                </Text>
                {convert && (
                  <Text style={styles.shareConverted}>≈ {formatMoney(convert(share.amount), mine, language)}</Text>
                )}
              </View>
              <Text style={[styles.amount, paid && styles.amountPaid]}>{formatMoney(share.amount, bill.currency, language)}</Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={t('bill.markPaid', { name: share.display_name })}
                accessibilityState={{ checked: paid, disabled: !canTick }}
                disabled={!canTick || busy !== null}
                hitSlop={6}
                onPress={() => toggle(share.user_id, !paid)}
                style={[styles.tick, paid && styles.tickOn, !canTick && !paid && styles.tickOff]}>
                {busy === share.user_id ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : paid ? (
                  <Icon name="check" size={16} color={Colors.white} />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.foot}>
        <Text style={styles.progress}>{t('bill.paidCount', { paid: paidCount, total: shares.length })}</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={pickCurrency}>
          <Text style={styles.currency}>
            {t('bill.showInShort')} {mine} ▾
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  bubble: {
    width: 280,
    padding: Spacing.lg,
    gap: 6,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  missing: { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  missingText: { ...Type.small, color: Colors.textMuted },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  receipt: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  paidBy: { ...Type.small, fontSize: 12, color: Colors.textSecondary },
  total: { ...Type.heading, fontSize: 26, lineHeight: 32, color: Colors.text, marginTop: Spacing.xs },
  converted: { ...Type.small, color: Colors.textSecondary, marginTop: -4 },
  extras: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  shares: { gap: Spacing.sm, marginTop: Spacing.sm },
  share: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  shareName: { ...Type.small, fontWeight: '700', color: Colors.text },
  shareConverted: { ...Type.small, fontSize: 11, color: Colors.textMuted },
  amount: { ...Type.label, fontSize: 14, color: Colors.text, fontVariant: ['tabular-nums'] },
  amountPaid: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: Colors.ok, borderColor: Colors.ok },
  tickOff: { borderColor: Colors.border },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  progress: { ...Type.small, fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  currency: { ...Type.small, fontSize: 12, fontWeight: '800', color: Colors.violetText },
}));

