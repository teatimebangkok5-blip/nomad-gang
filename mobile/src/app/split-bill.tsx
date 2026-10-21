import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ChatAvatar } from '@/components/chat-avatar';
import { Chip } from '@/components/chip';
import { FormFooter, FormSection, Stepper } from '@/components/form-parts';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { createBill, shareAmount, splitEqually, useChatMembers, type BillRates } from '@/lib/bills';
import type { ChatKind } from '@/lib/messages';
import { CURRENCIES, formatMoney } from '@/lib/currency';
import { makeStyles, useColors } from '@/lib/theme';

const DISCOUNTS = [0, 10, 15, 20] as const;
const TIPS = [0, 5, 10, 15] as const;
// People who aren't in the chat (the server allows up to 50).
const MAX_GUESTS = 50;

// "1,250.50" → 1250.5 (null if it isn't a number).
function parseAmount(text: string): number | null {
  const value = Number(text.replace(/[,\s]/g, ''));
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : null;
}

// Split the bill in a chat: equally or by each person's part, with the partner discount, service charge (10%), VAT
// (7%) and tip. Shows what everyone owes, then posts the bill in the chat (calculator only, no payments).
export default function SplitBillScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const myId = session?.user.id;
  const params = useLocalSearchParams<{ kind: ChatKind; id: string; discount?: string }>();
  const chat = { kind: params.kind, id: params.id };
  const members = useChatMembers(chat);
  const partnerDiscount = params.discount ? Number(params.discount) : null;

  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<string>('THB');
  const [mode, setMode] = useState<'equal' | 'parts'>('equal');
  const [total, setTotal] = useState('');
  // Equal mode: who shares it (everyone at first) plus people who aren't in the chat. Parts mode: each person's part
  // as typed.
  const [left, setLeft] = useState<Set<string>>(() => new Set());
  const [guests, setGuests] = useState(0);
  const [parts, setParts] = useState<Record<string, string>>({});
  const [discount, setDiscount] = useState<number>(partnerDiscount ?? 0);
  const [service, setService] = useState(false);
  const [vat, setVat] = useState(false);
  const [tip, setTip] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rates: BillRates = { discount, service: service ? 10 : 0, vat: vat ? 7 : 0, tip };
  const people = members ?? [];
  const sharing = people.filter((member) => !left.has(member.user_id));
  const totalValue = parseAmount(total);
  const guestCount = mode === 'equal' ? guests : 0;
  const headCount = sharing.length + guestCount;
  // Equal mode: the members ticked take the first parts (with any leftover satang), the people outside the chat the rest.
  const equalParts = mode === 'equal' && totalValue && sharing.length > 0 ? splitEqually(totalValue, headCount) : [];
  const subtotals: { userId: string; subtotal: number }[] =
    mode === 'equal'
      ? equalParts.slice(0, sharing.length).map((subtotal, i) => ({ userId: sharing[i].user_id, subtotal }))
      : people
          .map((member) => ({ userId: member.user_id, subtotal: parseAmount(parts[member.user_id] ?? '') ?? 0 }))
          .filter((share) => share.subtotal > 0);
  const guestParts = equalParts.slice(sharing.length);
  const guestSubtotal = Math.round(guestParts.reduce((sum, part) => sum + part, 0) * 100) / 100;
  const guestOwed = shareAmount(guestSubtotal, rates);
  const owed = subtotals.map((share) => ({ ...share, amount: shareAmount(share.subtotal, rates) }));
  const grandTotal = owed.reduce((sum, share) => sum + share.amount, 0) + guestOwed;
  const canPost = owed.length > 0 && grandTotal > 0;

  function toggleMember(userId: string) {
    setLeft((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function post() {
    setBusy(true);
    setError(null);
    const result = await createBill({
      chat,
      title,
      currency,
      rates,
      shares: subtotals,
      guests: guestSubtotal > 0 ? { count: guestCount, subtotal: guestSubtotal } : undefined,
    });
    setBusy(false);
    if (result) {
      setError(t(`bill.errors.${result}`));
      return;
    }
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title={`🧾 ${t('bill.title')}`} subtitle={t('bill.subtitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FormSection label={t('bill.what')} note={t('common.optional')}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              placeholder={t('bill.titlePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </FormSection>

          <FormSection label={t('bill.currency')}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {CURRENCIES.map((code) => (
                <Chip key={code} tone="violet" label={code} selected={currency === code} onPress={() => setCurrency(code)} />
              ))}
            </ScrollView>
          </FormSection>

          <View style={styles.modes}>
            {(['equal', 'parts'] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === item }}
                onPress={() => setMode(item)}
                style={[styles.mode, mode === item && styles.modeOn]}>
                <Text style={[styles.modeText, mode === item && styles.modeTextOn]}>{t(`bill.mode.${item}`)}</Text>
              </Pressable>
            ))}
          </View>

          {mode === 'equal' && (
            <FormSection label={t('bill.total')}>
              <View style={styles.amountRow}>
                <Text style={styles.amountCurrency}>{currency}</Text>
                <TextInput
                  value={total}
                  onChangeText={setTotal}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.amountInput}
                />
              </View>
            </FormSection>
          )}

          {mode === 'equal' && (
            <Stepper
              tone="violet"
              label={t('bill.people')}
              hint={t('bill.peopleHint')}
              value={String(headCount)}
              canDecrease={guests > 0}
              canIncrease={guests < MAX_GUESTS}
              onDecrease={() => setGuests((n) => Math.max(0, n - 1))}
              onIncrease={() => setGuests((n) => Math.min(MAX_GUESTS, n + 1))}
            />
          )}

          <FormSection label={mode === 'equal' ? t('bill.whoShares') : t('bill.eachPart')}>
            {members === null ? (
              <ActivityIndicator color={Colors.accent} />
            ) : people.length === 0 ? (
              <Text style={styles.error}>{t('bill.membersFailed')}</Text>
            ) : (
              people.map((member) => {
                const share = owed.find((item) => item.userId === member.user_id);
                const on = !left.has(member.user_id);
                const name = member.user_id === myId ? t('tables.you') : member.display_name;
                return (
                  <View key={member.user_id} style={styles.person}>
                    <GlossyFill />
                    <ChatAvatar name={member.display_name} photoPath={member.avatar_path} size={32} userId={member.user_id} />
                    <View style={styles.flex}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {name}
                      </Text>
                      {share && <Text style={styles.personOwes}>{formatMoney(share.amount, currency, language)}</Text>}
                    </View>
                    {mode === 'equal' ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={name}
                        accessibilityState={{ checked: on }}
                        onPress={() => toggleMember(member.user_id)}
                        hitSlop={8}>
                        <Icon name={on ? 'checkCircle' : 'circle'} size={26} color={on ? Colors.violetText : Colors.textMuted} />
                      </Pressable>
                    ) : (
                      <TextInput
                        value={parts[member.user_id] ?? ''}
                        onChangeText={(text) => setParts((current) => ({ ...current, [member.user_id]: text }))}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={Colors.textMuted}
                        accessibilityLabel={t('bill.partOf', { name })}
                        style={styles.partInput}
                      />
                    )}
                  </View>
                );
              })
            )}
            {guestCount > 0 && (
              <View style={styles.person}>
                <GlossyFill />
                <View style={styles.guestIcon}>
                  <Icon name="group" size={18} color={Colors.violetText} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {t('bill.guests', { count: guestCount })}
                  </Text>
                  {guestParts.length > 0 && (
                    <Text style={styles.personOwes}>
                      {t('bill.each', { amount: formatMoney(shareAmount(guestParts[guestParts.length - 1], rates), currency, language) })}
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('bill.removeGuests')}
                  onPress={() => setGuests(0)}
                  hitSlop={8}>
                  <Icon name="close" size={22} color={Colors.textMuted} />
                </Pressable>
              </View>
            )}
          </FormSection>

          <FormSection label={t('bill.discount')}>
            <View style={styles.chipsWrap}>
              {[...new Set([...(partnerDiscount ? [partnerDiscount] : []), ...DISCOUNTS])].map((pct) => (
                <Chip
                  key={pct}
                  tone="violet"
                  label={pct === 0 ? t('bill.none') : pct === partnerDiscount ? t('bill.partnerDeal', { pct }) : `−${pct}%`}
                  selected={discount === pct}
                  onPress={() => setDiscount(pct)}
                />
              ))}
            </View>
          </FormSection>

          <FormSection label={t('bill.charges')}>
            <View style={styles.chipsWrap}>
              <Chip tone="violet" label={t('bill.service')} selected={service} onPress={() => setService(!service)} />
              <Chip tone="violet" label={t('bill.vat')} selected={vat} onPress={() => setVat(!vat)} />
            </View>
            <Text style={styles.hint}>{t('bill.chargesHint')}</Text>
          </FormSection>

          <FormSection label={t('bill.tip')}>
            <View style={styles.chipsWrap}>
              {TIPS.map((pct) => (
                <Chip key={pct} tone="violet" label={pct === 0 ? t('bill.none') : `${pct}%`} selected={tip === pct} onPress={() => setTip(pct)} />
              ))}
            </View>
          </FormSection>

          <View style={styles.summary}>
            <GlossyFill />
            <Text style={styles.summaryLabel}>{t('bill.everyoneOwes')}</Text>
            <Text style={styles.summaryTotal}>{formatMoney(grandTotal, currency, language)}</Text>
            <Text style={styles.hint}>{t('bill.youPaid')}</Text>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
      <FormFooter>
        <Button variant="violet" title={t('bill.post')} disabled={!canPost} loading={busy} onPress={post} />
      </FormFooter>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  chips: { gap: Spacing.sm },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { ...Type.small, color: Colors.textSecondary },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.field,
    color: Colors.text,
    fontSize: 16,
  },
  modes: { flexDirection: 'row', padding: 4, borderRadius: Radius.pill, backgroundColor: Colors.surfaceRaised },
  mode: { flex: 1, minHeight: 40, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  modeOn: { backgroundColor: Colors.violet },
  modeText: { ...Type.label, color: Colors.textSecondary },
  modeTextOn: { color: Colors.white },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.field,
  },
  amountCurrency: { ...Type.label, fontSize: 16, color: Colors.textSecondary },
  amountInput: { flex: 1, minHeight: 56, fontSize: 24, fontWeight: '800', color: Colors.text },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  personName: { ...Type.label, fontSize: 15, color: Colors.text },
  personOwes: { ...Type.small, fontWeight: '700', color: Colors.violetText },
  guestIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violetTint,
  },
  partInput: {
    width: 110,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.field,
    color: Colors.text,
    fontSize: 16,
    textAlign: 'right',
  },
  summary: {
    padding: Spacing.lg,
    gap: 2,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.violet,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  summaryLabel: { ...Type.small, fontWeight: '700', color: Colors.textSecondary },
  summaryTotal: { ...Type.heading, fontSize: 28, lineHeight: 34, color: Colors.text },
  error: { ...Type.small, color: Colors.danger },
}));
