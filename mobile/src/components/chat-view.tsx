import * as Clipboard from 'expo-clipboard';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatAvatar } from '@/components/chat-avatar';
import { BillBubble } from '@/components/bill-bubble';
import { LocationBubble, PhotoBubble, VoiceBubble } from '@/components/chat-bubbles';
import { GlossyFill } from '@/components/glossy';
import { IcebreakerBubble, IcebreakerSheet, MeetupInviteBubble } from '@/components/icebreaker';
import { Icon, type IconName } from '@/components/icon';
import { BigEmoji, EmojiImage, EmojiPanel, EmojiText, emojiLabel } from '@/components/tm-emoji';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { bangkokDay, bangkokMinutes, deviceZone, formatClock, formatDayLabel } from '@/lib/bangkok-time';
import type { ChatErrorKey, ChatMessage } from '@/lib/chat';
import {
  editMessage,
  LIVE_DURATIONS,
  MAX_VOICE_MS,
  sendChatCard,
  sendPhoto,
  sendVoiceNote,
  startLiveLocation,
  unsendMessage,
  type ChatRef,
  type LiveMinutes,
  type PhotoSource,
} from '@/lib/chat-media';
import { useChatReactions, type ReactionCount } from '@/lib/reactions';
import { makeStyles, useColors } from '@/lib/theme';
import {
  bigEmoji,
  EMOJI_BY_ID,
  emojiPreview,
  emojiText,
  hasSticker,
  parseEmojiText,
  QUICK_REACTIONS,
  TEXT_EMOJI_CATEGORIES,
  type TmEmoji,
} from '@/lib/tm-emoji';

const AVATAR = 32;
const MAX_LENGTH = 1000;
type Selection = { start: number; end: number };

// Message list (newest at the bottom) and a composer: + for photos (camera or gallery), voice notes and live
// location, icebreaker cards and splitting the bill; the message box; and the emoji button that swaps the keyboard for
// TableMeet's emoji (greetings are sent at once as stickers). Messages that are only emoji show big and animated.
// Used by table / hangout chats,
// private chats and group chats. Other people's messages show their profile picture; tapping it opens their
// profile. Press and hold a message to react (anyone who can write here), copy it, or edit / unsend your own.
export function ChatView({
  messages,
  myId,
  showNames,
  onSend,
  chat,
  attachHint,
  banner,
  canSend = true,
  emptyText,
  partnerDiscount,
}: {
  messages: ChatMessage[] | null;
  myId: string | undefined;
  // Show the sender's name above other people's messages (group chats).
  showNames: boolean;
  onSend: (body: string) => Promise<ChatErrorKey | null>;
  // The chat, for photos / voice notes / location and reactions. Null: the + button explains `attachHint` instead.
  chat: ChatRef | null;
  // Why attachments aren't possible yet (a private chat that hasn't started).
  attachHint?: string;
  banner?: ReactNode;
  canSend?: boolean;
  emptyText?: string;
  // The partner venue's % deal, offered first when splitting the bill.
  partnerDiscount?: number | null;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const language = useLanguage();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatErrorKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [icebreakerOpen, setIcebreakerOpen] = useState(false);
  // The message being edited (its text is in the composer).
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  // The emoji panel shows instead of the keyboard.
  const [emojiOpen, setEmojiOpen] = useState(false);
  // The message pressed and held (reactions and actions sheet), and whether its full emoji list is open.
  const [held, setHeld] = useState<ChatMessage | null>(null);
  const [allReactions, setAllReactions] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Where the cursor was, so emoji go there even while the keyboard is hidden.
  const selection = useRef<Selection | null>(null);
  const canReact = Boolean(chat && myId && canSend);
  const { reactions, react } = useChatReactions(chat, myId);

  // Android's back button closes the emoji panel first.
  useEffect(() => {
    if (!emojiOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEmojiOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [emojiOpen]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = editing && chat ? await editMessage(chat.kind, editing.id, body) : await onSend(body);
    setSending(false);
    if (result) {
      setError(result);
      return;
    }
    setDraft('');
    selection.current = null;
    setEditing(null);
  }

  // A greeting sticker goes out on its own; whatever is typed stays in the box.
  async function sendSticker(emoji: TmEmoji) {
    if (sending) return;
    setSending(true);
    setError(null);
    const result = await onSend(emojiText(emoji));
    setSending(false);
    if (result) setError(result);
  }

  function pickEmoji(emoji: TmEmoji) {
    if (!emoji.char) {
      sendSticker(emoji);
      return;
    }
    const at = selection.current ?? { start: draft.length, end: draft.length };
    const next = draft.slice(0, at.start) + emoji.char + draft.slice(at.end);
    if (next.length > MAX_LENGTH) return;
    setDraft(next);
    const cursor = at.start + emoji.char.length;
    selection.current = { start: cursor, end: cursor };
  }

  function toggleEmoji() {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
    selection.current = null;
  }

  function closeHeld() {
    setHeld(null);
    setAllReactions(false);
  }

  function myReaction(message: ChatMessage): string | null {
    return reactions.get(message.id)?.find((chip) => chip.mine)?.emoji ?? null;
  }

  // Picking my current reaction again takes it back.
  async function toggleReaction(message: ChatMessage, emoji: string) {
    closeHeld();
    const result = await react(message.id, myReaction(message) === emoji ? null : emoji);
    if (result) setError(result);
  }

  function unsend(message: ChatMessage) {
    if (!chat) return;
    closeHeld();
    Alert.alert(t('chat.unsendConfirm'), t('chat.unsendBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.unsend'),
        style: 'destructive',
        onPress: async () => {
          const result = await unsendMessage(chat.kind, message.id);
          if (result) setError(result);
          if (editing?.id === message.id) cancelEdit();
        },
      },
    ]);
  }

  function startEdit(message: ChatMessage) {
    closeHeld();
    setEmojiOpen(false);
    setEditing(message);
    setDraft(message.body);
    selection.current = null;
  }

  function copy(message: ChatMessage) {
    closeHeld();
    Clipboard.setStringAsync(emojiPreview(message.body, language));
  }

  async function attach(work: () => Promise<ChatErrorKey | 'cancelled' | 'permission' | null>, deniedText: string) {
    setAttaching(true);
    setError(null);
    const result = await work();
    setAttaching(false);
    if (result === 'permission') Alert.alert(deniedText);
    else if (result && result !== 'cancelled') setError(result);
  }

  function pickPhoto(source: PhotoSource) {
    setMenuOpen(false);
    if (!chat || !myId) return;
    attach(() => sendPhoto(chat, myId, source), t('chat.cameraDenied'));
  }

  function shareLocation() {
    setMenuOpen(false);
    if (!chat) return;
    const labels: Record<LiveMinutes, string> = { 15: t('chat.minutes15'), 60: t('chat.hour1'), 480: t('chat.hours8') };
    Alert.alert(
      t('chat.liveFor'),
      t('chat.liveHint'),
      [
        ...LIVE_DURATIONS.map((minutes) => ({
          text: labels[minutes],
          onPress: () => attach(() => startLiveLocation(chat, minutes), t('chat.locationDenied')),
        })),
      ],
      { cancelable: true },
    );
  }

  function openIcebreaker() {
    setMenuOpen(false);
    setIcebreakerOpen(true);
  }

  async function dealCard(card: string) {
    setIcebreakerOpen(false);
    if (!chat) return;
    setError(null);
    const result = await sendChatCard(chat, card);
    if (result) setError(result);
  }

  function splitBill() {
    setMenuOpen(false);
    if (!chat) return;
    router.push({
      pathname: '/split-bill',
      params: { kind: chat.kind, id: chat.id, ...(partnerDiscount ? { discount: String(partnerDiscount) } : {}) },
    });
  }

  async function startVoice() {
    setMenuOpen(false);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('chat.micDenied'));
      return;
    }
    setEmojiOpen(false);
    setRecording(true);
  }

  // The + button is in every chat the person can write in.
  const attachShown = Boolean(myId && canSend);

  function openMenu() {
    if (chat) setMenuOpen(true);
    else if (attachHint) Alert.alert(attachHint);
  }

  const heldMine = held?.sender_id === myId;
  const heldText = held?.kind === 'text';
  const showSend = Boolean(draft.trim()) || Boolean(editing);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {banner}
      {messages === null ? (
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      ) : messages.length === 0 ? (
        // Outside the inverted list: its flip differs by platform (Android flips both axes), which mirrored the text.
        <View style={styles.flex}>
          <Text style={styles.empty}>{emptyText ?? t('chat.empty')}</Text>
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          extraData={reactions}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const mine = item.sender_id === myId;
            // In an inverted list the next item is the older message.
            const older = messages[index + 1];
            // A day label ("Today", "Sat 17") above the first message of each day, in the phone's time zone.
            const zone = deviceZone();
            const day = bangkokDay(new Date(item.created_at), zone);
            const newDay = !older || bangkokDay(new Date(older.created_at), zone) !== day;
            const firstOfRun = newDay || older.sender_id !== item.sender_id;
            const holdable = item.kind !== 'unsent' && Boolean(chat) && (canReact || mine);
            const chips = reactions.get(item.id);
            const row = (
              <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, firstOfRun && styles.rowFirst]}>
                {!mine &&
                  (firstOfRun ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.openProfile', { name: item.sender_name })}
                      hitSlop={4}
                      onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: item.sender_id } })}>
                      <ChatAvatar name={item.sender_name} photoPath={item.sender_avatar} size={AVATAR} userId={item.sender_id} />
                    </Pressable>
                  ) : (
                    <View style={styles.avatarSpace} />
                  ))}
                <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs]}>
                  {showNames && !mine && firstOfRun && <Text style={styles.name}>{item.sender_name}</Text>}
                  <MessageContent
                    message={item}
                    mine={mine}
                    myId={myId}
                    chat={chat}
                    onLongPress={holdable ? () => setHeld(item) : undefined}
                  />
                  {chips && chips.length > 0 && (
                    <ReactionChips
                      chips={chips}
                      mine={mine}
                      onToggle={canReact ? (emoji) => toggleReaction(item, emoji) : undefined}
                    />
                  )}
                </View>
              </View>
            );
            if (!newDay) return row;
            return (
              <View>
                <Text style={styles.dayLabel}>{formatDayLabel(day, t, undefined, zone)}</Text>
                {row}
              </View>
            );
          }}
        />
      )}

      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {t(`chat.errors.${error}`)}
        </Text>
      )}

      {recording && chat && myId ? (
        <VoiceRecorder
          onCancel={() => setRecording(false)}
          onDone={(uri, durationMs) => {
            setRecording(false);
            attach(() => sendVoiceNote(chat, myId, uri, durationMs), t('chat.micDenied'));
          }}
        />
      ) : (
        <View>
          {editing && (
            <View style={styles.editBar}>
              <Icon name="edit" size={18} color={Colors.violetText} />
              <View style={styles.editText}>
                <Text style={styles.editTitle}>{t('chat.editing')}</Text>
                <EmojiText
                  parts={parseEmojiText(editing.body)}
                  body={editing.body}
                  style={styles.editPreview}
                  emojiSize={16}
                />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={8} onPress={cancelEdit}>
                <Icon name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}
          <View style={styles.composer}>
            {attachShown && !editing && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.attach')}
                disabled={attaching}
                onPress={openMenu}
                style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
                <GlossyFill />
                {attaching ? (
                  <ActivityIndicator color={Colors.violetText} />
                ) : (
                  <Icon name="plus" size={26} color={Colors.violetText} />
                )}
              </Pressable>
            )}
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              onSelectionChange={(event) => {
                selection.current = event.nativeEvent.selection;
              }}
              onFocus={() => setEmojiOpen(false)}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={Colors.textMuted}
              selectionColor={Colors.violet}
              keyboardAppearance="dark"
              multiline
              maxLength={MAX_LENGTH}
              editable={canSend}
              style={styles.input}
            />
            {canSend && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={emojiOpen ? t('chat.showKeyboard') : t('chat.emoji')}
                onPress={toggleEmoji}
                style={({ pressed }) => [styles.round, emojiOpen && styles.roundOn, pressed && styles.pressed]}>
                <GlossyFill />
                {emojiOpen ? (
                  <Icon name="keyboard" size={22} color={Colors.violetText} />
                ) : (
                  <EmojiImage emoji={EMOJI_BY_ID.get('happy')!} size={28} />
                )}
              </Pressable>
            )}
            {showSend && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.send')}
                disabled={!canSend || sending || !draft.trim()}
                onPress={send}
                style={({ pressed }) => [styles.send, !draft.trim() && styles.sendDisabled, pressed && styles.pressed]}>
                {sending ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Icon name={editing ? 'check' : 'send'} size={20} color={draft.trim() ? Colors.white : Colors.textMuted} />
                )}
              </Pressable>
            )}
          </View>
          {emojiOpen && canSend && (
            <EmojiPanel onPick={pickEmoji} categories={editing ? TEXT_EMOJI_CATEGORIES : undefined} />
          )}
        </View>
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} accessibilityLabel={t('common.cancel')}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={() => {}}>
            <GlossyFill />
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t('chat.attachTitle')}</Text>
            <View style={styles.options}>
              <AttachOption icon="camera" color={Colors.pink} label={t('chat.camera')} onPress={() => pickPhoto('camera')} />
              <AttachOption icon="gallery" color={Colors.violet} label={t('chat.gallery')} onPress={() => pickPhoto('library')} />
              <AttachOption icon="mic" color={Colors.coral} label={t('chat.voice')} onPress={startVoice} />
              <AttachOption icon="liveLocation" color={Colors.orange} label={t('chat.liveLocation')} onPress={shareLocation} />
              <AttachOption icon="dice" color={Colors.violet} label={t('icebreaker.title')} onPress={openIcebreaker} />
              <AttachOption icon="receipt" color={Colors.ok} label={t('bill.title')} onPress={splitBill} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <IcebreakerSheet visible={icebreakerOpen} onClose={() => setIcebreakerOpen(false)} onDeal={dealCard} />

      <Modal visible={held !== null} transparent animationType="fade" onRequestClose={closeHeld}>
        <Pressable style={styles.backdrop} onPress={closeHeld} accessibilityLabel={t('common.cancel')}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]} onPress={() => {}}>
            <GlossyFill />
            <View style={styles.handle} />
            {held && canReact && !allReactions && (
              <View style={styles.quickRow}>
                {QUICK_REACTIONS.map((id) => {
                  const emoji = EMOJI_BY_ID.get(id)!;
                  const on = myReaction(held) === id;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.reactWith', { emoji: emojiLabel(emoji, language) })}
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleReaction(held, id)}
                      style={({ pressed }) => [styles.quick, on && styles.quickOn, pressed && styles.pressed]}>
                      <EmojiImage emoji={emoji} size={36} />
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.moreReactions')}
                  onPress={() => setAllReactions(true)}
                  style={({ pressed }) => [styles.quick, styles.quickMore, pressed && styles.pressed]}>
                  <Icon name="addReaction" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>
            )}
            {held && canReact && allReactions && (
              <View style={styles.sheetPanel}>
                <EmojiPanel
                  categories={TEXT_EMOJI_CATEGORIES}
                  selected={myReaction(held)}
                  onPick={(emoji) => toggleReaction(held, emoji.id)}
                  height={300}
                />
              </View>
            )}
            {held && !allReactions && (
              <View style={styles.actions}>
                {heldText && (
                  <SheetAction icon="copy" label={t('chat.copy')} onPress={() => copy(held)} />
                )}
                {heldMine && heldText && !hasSticker(held.body) && (
                  <SheetAction icon="edit" label={t('chat.edit')} onPress={() => startEdit(held)} />
                )}
                {heldMine && (
                  <SheetAction icon="delete" label={t('chat.unsend')} danger onPress={() => unsend(held)} />
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function MessageContent({
  message,
  mine,
  myId,
  chat,
  onLongPress,
}: {
  message: ChatMessage;
  mine: boolean;
  myId: string | undefined;
  chat: ChatRef | null;
  onLongPress?: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const time = formatClock(bangkokMinutes(new Date(message.created_at), deviceZone()));
  if (message.kind === 'photo') return <PhotoBubble message={message} mine={mine} onLongPress={onLongPress} />;
  if (message.kind === 'voice') return <VoiceBubble message={message} mine={mine} onLongPress={onLongPress} />;
  if (message.kind === 'location' && chat) {
    return <LocationBubble message={message} mine={mine} chatKind={chat.kind} onLongPress={onLongPress} />;
  }
  if (message.kind === 'card') {
    return message.body.startsWith('meetup:') ? (
      <MeetupInviteBubble meetupId={message.body.slice(7)} onLongPress={onLongPress} />
    ) : (
      <IcebreakerBubble body={message.body} onLongPress={onLongPress} />
    );
  }
  if (message.kind === 'bill') return <BillBubble billId={message.body} myId={myId} onLongPress={onLongPress} />;
  if (message.kind === 'unsent') {
    return (
      <View style={[styles.bubble, styles.bubbleUnsent]}>
        <Text style={styles.unsent}>🚫 {mine ? t('chat.youUnsent') : t('chat.unsentMessage')}</Text>
        <Text style={styles.time}>{time}</Text>
      </View>
    );
  }
  const timeText = message.edited_at ? `${t('chat.edited')} · ${time}` : time;
  const parts = parseEmojiText(message.body);
  const big = bigEmoji(parts);
  if (big) {
    return (
      <Pressable
        onLongPress={onLongPress}
        accessibilityLabel={emojiPreview(message.body, language)}
        style={[styles.big, mine ? styles.columnMine : styles.columnTheirs]}>
        <BigEmoji emoji={big} />
        <Text style={styles.time}>{timeText}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onLongPress={onLongPress} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <EmojiText parts={parts} body={message.body} style={[styles.body, mine && styles.bodyMine]} />
      <Text style={[styles.time, mine && styles.timeMine]}>{timeText}</Text>
    </Pressable>
  );
}

// The reactions under a message; tapping one adds mine (or takes it back if it's mine).
function ReactionChips({
  chips,
  mine,
  onToggle,
}: {
  chips: ReactionCount[];
  mine: boolean;
  onToggle?: (emoji: string) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  return (
    <View style={[styles.chips, mine && styles.chipsMine]}>
      {chips.map((chip) => {
        const emoji = EMOJI_BY_ID.get(chip.emoji);
        if (!emoji) return null;
        return (
          <Pressable
            key={chip.emoji}
            accessibilityRole="button"
            accessibilityLabel={t('chat.reactionCount', { emoji: emojiLabel(emoji, language), count: chip.count })}
            accessibilityState={{ selected: chip.mine, disabled: !onToggle }}
            disabled={!onToggle}
            onPress={() => onToggle?.(chip.emoji)}
            style={({ pressed }) => [styles.chip, chip.mine && styles.chipMine, pressed && styles.pressed]}>
            <EmojiImage emoji={emoji} size={18} />
            <Text style={[styles.chipCount, chip.mine && styles.chipCountMine]}>{chip.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SheetAction({
  icon,
  label,
  danger = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
      <Icon name={icon} size={22} color={danger ? Colors.danger : Colors.text} />
      <Text style={[styles.actionLabel, danger && styles.actionDanger]}>{label}</Text>
    </Pressable>
  );
}

function AttachOption({ icon, color, label, onPress }: { icon: IconName; color: string; label: string; onPress: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <View style={[styles.optionIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={26} color={Colors.white} />
      </View>
      <Text style={styles.optionLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// Records a voice note (up to 2 minutes): a red dot and the time, delete, and send.
function VoiceRecorder({ onCancel, onDone }: { onCancel: () => void; onDone: (uri: string, durationMs: number) => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [started, setStarted] = useState(false);
  // Kept in refs so a parent re-render (e.g. a new message arriving) doesn't restart the recording.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    let cancelled = false;
    setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      .then(() => recorder.prepareToRecordAsync())
      .then(() => {
        if (cancelled) return;
        recorder.record();
        setStarted(true);
      })
      .catch((error) => {
        console.warn('Starting recording failed', error);
        cancelRef.current();
      });
    return () => {
      cancelled = true;
    };
  }, [recorder]);

  async function finish(sendIt: boolean) {
    const durationMs = state.durationMillis;
    try {
      await recorder.stop();
    } catch (error) {
      console.warn('Stopping recording failed', error);
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (sendIt && recorder.uri && durationMs >= 500) onDone(recorder.uri, durationMs);
    else onCancel();
  }

  // Stop and send at the limit.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  const atLimit = started && state.durationMillis >= MAX_VOICE_MS;
  useEffect(() => {
    if (atLimit) finishRef.current(true);
  }, [atLimit]);

  const seconds = Math.floor(state.durationMillis / 1000);
  return (
    <View style={styles.composer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.cancelRecording')}
        onPress={() => finish(false)}
        style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
        <GlossyFill />
        <Icon name="delete" size={24} color={Colors.danger} />
      </Pressable>
      <View style={styles.recording}>
        <View style={styles.redDot} />
        <Text style={styles.recordingText}>
          {t('chat.recording')} {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.sendVoice')}
        disabled={!started}
        onPress={() => finish(true)}
        style={({ pressed }) => [styles.send, !started && styles.sendDisabled, pressed && styles.pressed]}>
        <Icon name="send" size={20} color={started ? Colors.white : Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl },
  list: { padding: Spacing.lg, gap: Spacing.xs, flexGrow: 1 },
  empty: { ...Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  rowFirst: { marginTop: Spacing.sm },
  dayLabel: { ...Type.small, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xs },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatarSpace: { width: AVATAR },
  column: { maxWidth: '80%' },
  columnMine: { alignItems: 'flex-end' },
  columnTheirs: { alignItems: 'flex-start' },
  name: { ...Type.small, fontSize: 12, color: Colors.textMuted, marginBottom: 2, marginLeft: Spacing.sm },
  bubble: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg },
  bubbleMine: { backgroundColor: Colors.violet, borderBottomRightRadius: Radius.sm },
  bubbleTheirs: { backgroundColor: Colors.surfaceRaised, borderBottomLeftRadius: Radius.sm },
  bubbleUnsent: { borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  big: { paddingVertical: 2 },
  unsent: { ...Type.small, fontStyle: 'italic', color: Colors.textMuted },
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  editText: { flex: 1 },
  editTitle: { ...Type.label, color: Colors.violetText },
  editPreview: { ...Type.small, color: Colors.textSecondary },
  body: { ...Type.body, color: Colors.text },
  bodyMine: { color: Colors.white },
  time: { fontSize: 11, lineHeight: 14, color: Colors.textMuted, alignSelf: 'flex-end', marginTop: 2 },
  timeMine: { color: Colors.white, opacity: 0.75 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chipsMine: { justifyContent: 'flex-end' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipMine: { backgroundColor: Colors.violetTint, borderColor: Colors.violet },
  chipCount: { ...Type.small, fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipCountMine: { color: Colors.violetText },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    marginHorizontal: Spacing.lg,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  roundOn: { backgroundColor: Colors.violetTint },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: Spacing.lg,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: Colors.surfaceRaised },
  pressed: { opacity: 0.7 },
  recording: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerBg,
  },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.danger },
  recordingText: { ...Type.label, color: Colors.text, fontVariant: ['tabular-nums'] },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  sheetTitle: { ...Type.heading, color: Colors.text, marginTop: Spacing.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.lg, marginTop: Spacing.lg },
  option: { width: '25%', alignItems: 'center', gap: Spacing.sm },
  optionIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { ...Type.small, color: Colors.text, textAlign: 'center' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md, marginBottom: Spacing.sm },
  quick: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  quickOn: { backgroundColor: Colors.violetTint, borderWidth: 1.5, borderColor: Colors.violet },
  quickMore: { backgroundColor: Colors.surfaceRaised },
  sheetPanel: { marginHorizontal: -Spacing.lg, marginTop: Spacing.sm, marginBottom: -Spacing.md },
  actions: { marginTop: Spacing.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 52,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  actionPressed: { backgroundColor: Colors.pressed },
  actionLabel: { ...Type.body, color: Colors.text },
  actionDanger: { color: Colors.danger },
}));
