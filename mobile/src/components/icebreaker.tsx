import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Radius, Spacing, ToneShadow, Type, type Tone } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { formatWhen } from '@/lib/bangkok-time';
import { cardId, cardText, DECKS, parseCard, randomCardIndex, type Deck } from '@/lib/icebreakers';
import { supabase } from '@/lib/supabase';
import { makeStyles, useColors } from '@/lib/theme';

// Text on orange / brand fills is onBrand; on violet, lilac and plan it's white.
function onTone(tone: Tone, Colors: ReturnType<typeof useColors>) {
  return tone === 'orange' || tone === 'brand' ? Colors.onBrand : Colors.white;
}

// Pick a deck, draw cards until one fits, then deal it into the chat for everyone.
export function IcebreakerSheet({
  visible,
  onClose,
  onDeal,
}: {
  visible: boolean;
  onClose: () => void;
  onDeal: (card: string) => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const language = useLanguage();
  const [deck, setDeck] = useState<Deck>(DECKS[0]);
  const [index, setIndex] = useState(() => randomCardIndex(DECKS[0], null));
  const card = deck.cards[index];
  const ink = onTone(deck.tone, Colors);

  function pickDeck(next: Deck) {
    setDeck(next);
    setIndex(randomCardIndex(next, null));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.cancel')}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={() => {}}>
          <GlossyFill />
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>🎲 {t('icebreaker.title')}</Text>
          <Text style={styles.sheetHint}>{t('icebreaker.hint')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.decks}>
            {DECKS.map((item) => {
              const on = item.id === deck.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => pickDeck(item)}
                  style={({ pressed }) => [styles.deck, on && styles.deckOn, pressed && styles.pressed]}>
                  <Text style={styles.deckEmoji}>{item.emoji}</Text>
                  <Text style={[styles.deckName, on && styles.deckNameOn]} numberOfLines={1}>
                    {cardText(item.name, language)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.card, ToneShadow[deck.tone === 'orange' || deck.tone === 'plan' ? deck.tone : 'violet']]}>
            <ToneFill tone={deck.tone} />
            <Text style={[styles.cardDeck, { color: ink }]}>
              {deck.emoji} {cardText(deck.name, language)} · {index + 1}/{deck.cards.length}
            </Text>
            <Text style={[styles.cardQuestion, { color: ink }]}>{cardText(card, language)}</Text>
            <Text style={[styles.cardHint, { color: ink }]}>{cardText(deck.hint, language)}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIndex(randomCardIndex(deck, index))}
              style={({ pressed }) => [styles.another, pressed && styles.pressed]}>
              <GlossyFill />
              <Icon name="dice" size={20} color={Colors.text} />
              <Text style={styles.anotherText}>{t('icebreaker.another')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDeal(cardId(deck, index))}
              style={({ pressed }) => [styles.deal, pressed && styles.pressed]}>
              <ToneFill tone="violet" />
              <Icon name="send" size={20} color={Colors.white} />
              <Text style={styles.dealText}>{t('icebreaker.deal')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// An icebreaker card in the chat, in the reader's language. Trivia cards hide their answer until tapped.
export function IcebreakerBubble({ body, onLongPress }: { body: string; onLongPress?: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [revealed, setRevealed] = useState(false);
  const parsed = parseCard(body);
  if (!parsed) {
    return (
      <View style={styles.unknown}>
        <Text style={styles.unknownText}>🎲 {t('icebreaker.unknown')}</Text>
      </View>
    );
  }
  const { deck, card } = parsed;
  const ink = onTone(deck.tone, Colors);
  return (
    <Pressable onLongPress={onLongPress} style={styles.bubble}>
      <ToneFill tone={deck.tone} />
      <Text style={[styles.bubbleDeck, { color: ink }]}>
        🎲 {t('icebreaker.title')} · {deck.emoji} {cardText(deck.name, language)}
      </Text>
      <Text style={[styles.bubbleQuestion, { color: ink }]}>{cardText(card, language)}</Text>
      {card.answer &&
        (revealed ? (
          <Text style={[styles.answer, { color: ink }]}>💡 {cardText(card.answer, language)}</Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={styles.reveal}>
            <Text style={[styles.revealText, { color: ink }]}>{t('icebreaker.showAnswer')}</Text>
          </Pressable>
        ))}
    </Pressable>
  );
}

type InviteMeetup = {
  id: string;
  kind: 'table' | 'hangout';
  title: string;
  starts_at: string;
  time_zone: string;
  status: string;
  ends_at: string;
  spot_name: string | null;
  place: { name: string; name_en: string | null; name_th: string | null } | null;
  venue: { name_en: string; name_th: string } | null;
};

// "Join us for the next round": a table / hangout shared in the chat (a second round). Tap to open it.
export function MeetupInviteBubble({ meetupId, onLongPress }: { meetupId: string; onLongPress?: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [meetup, setMeetup] = useState<InviteMeetup | null | 'missing'>(null);

  useEffect(() => {
    supabase
      .from('meetups')
      .select('id, kind, title, starts_at, ends_at, time_zone, status, spot_name, place:places(name, name_en, name_th), venue:venues(name_en, name_th)')
      .eq('id', meetupId)
      .maybeSingle()
      .then(({ data }) => setMeetup((data as unknown as InviteMeetup | null) ?? 'missing'));
  }, [meetupId]);

  if (meetup === null) {
    return (
      <View style={styles.invite}>
        <ActivityIndicator color={Colors.violetText} />
      </View>
    );
  }
  if (meetup === 'missing' || meetup.status !== 'open') {
    return (
      <View style={styles.unknown}>
        <Text style={styles.unknownText}>🍻 {t('round.inviteGone')}</Text>
      </View>
    );
  }
  const place =
    (meetup.venue && (language === 'th' ? meetup.venue.name_th : meetup.venue.name_en)) ||
    (meetup.place && ((language === 'th' ? meetup.place.name_th : meetup.place.name_en) || meetup.place.name)) ||
    meetup.spot_name ||
    '';
  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={() => router.push({ pathname: '/table/[id]', params: { id: meetup.id } })}
      style={({ pressed }) => [styles.invite, pressed && styles.pressed]}>
      <GlossyFill />
      <Text style={styles.inviteLabel}>🍻 {t('round.inviteCard')}</Text>
      <Text style={styles.inviteTitle} numberOfLines={2}>
        {meetup.title || place}
      </Text>
      <Text style={styles.inviteMeta} numberOfLines={2}>
        {[meetup.title ? place : null, formatWhen(meetup.starts_at, t, undefined, meetup.time_zone)].filter(Boolean).join(' · ')}
      </Text>
      <View style={styles.inviteOpen}>
        <Text style={styles.inviteOpenText}>{t('round.openInvite')}</Text>
        <Icon name="chevronRight" size={18} color={Colors.violetText} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  pressed: { opacity: 0.8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  sheetTitle: { ...Type.heading, color: Colors.text },
  sheetHint: { ...Type.small, color: Colors.textSecondary, marginTop: -Spacing.sm },
  decks: { gap: Spacing.sm },
  deck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  deckOn: { borderColor: Colors.violet, backgroundColor: Colors.violetTint },
  deckEmoji: { fontSize: 18 },
  deckName: { ...Type.label, color: Colors.textSecondary },
  deckNameOn: { color: Colors.violetText },
  card: {
    minHeight: 190,
    padding: Spacing.xl,
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  cardDeck: { ...Type.small, fontWeight: '800', opacity: 0.9 },
  cardQuestion: { ...Type.heading, fontSize: 22, lineHeight: 29 },
  cardHint: { ...Type.small, opacity: 0.85 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  another: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  anotherText: { ...Type.label, fontSize: 15, color: Colors.text },
  deal: {
    flex: 1.3,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  dealText: { ...Type.label, fontSize: 15, color: Colors.white },
  bubble: { width: 260, padding: Spacing.lg, gap: Spacing.sm, borderRadius: 22, overflow: 'hidden' },
  bubbleDeck: { ...Type.small, fontSize: 12, fontWeight: '800', opacity: 0.9 },
  bubbleQuestion: { ...Type.heading, fontSize: 18, lineHeight: 24 },
  reveal: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  revealText: { ...Type.label, fontSize: 13 },
  answer: { ...Type.body, fontWeight: '700' },
  unknown: { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  unknownText: { ...Type.small, color: Colors.textMuted },
  invite: {
    width: 260,
    padding: Spacing.lg,
    gap: 4,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.violet,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  inviteLabel: { ...Type.small, fontSize: 12, fontWeight: '800', color: Colors.violetText },
  inviteTitle: { ...Type.heading, fontSize: 17, color: Colors.text },
  inviteMeta: { ...Type.small, color: Colors.textSecondary },
  inviteOpen: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: Spacing.xs },
  inviteOpenText: { ...Type.label, color: Colors.violetText },
}));
