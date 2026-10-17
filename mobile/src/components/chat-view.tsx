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
  FlatList,
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
import { LocationBubble, PhotoBubble, VoiceBubble } from '@/components/chat-bubbles';
import { GlossyFill } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { bangkokMinutes, deviceZone, formatClock } from '@/lib/bangkok-time';
import type { ChatErrorKey, ChatMessage } from '@/lib/chat';
import {
  editMessage,
  LIVE_DURATIONS,
  MAX_VOICE_MS,
  sendPhoto,
  sendVoiceNote,
  startLiveLocation,
  unsendMessage,
  type ChatRef,
  type LiveMinutes,
  type PhotoSource,
} from '@/lib/chat-media';
import { makeStyles, useColors } from '@/lib/theme';

const AVATAR = 32;

// Message list (newest at the bottom) and a composer with a + button for photos (camera or gallery), voice notes and
// live location. Used by table / hangout chats, private chats and group chats. Other people's messages show their
// profile picture; tapping it opens their profile. Press and hold one of your own messages to edit (text) or unsend it.
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
}: {
  messages: ChatMessage[] | null;
  myId: string | undefined;
  // Show the sender's name above other people's messages (group chats).
  showNames: boolean;
  onSend: (body: string) => Promise<ChatErrorKey | null>;
  // The chat, for photos / voice notes / location. Null: the + button explains `attachHint` instead.
  chat: ChatRef | null;
  // Why attachments aren't possible yet (a private chat that hasn't started).
  attachHint?: string;
  banner?: ReactNode;
  canSend?: boolean;
  emptyText?: string;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatErrorKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attaching, setAttaching] = useState(false);
  // The message being edited (its text is in the composer).
  const [editing, setEditing] = useState<ChatMessage | null>(null);

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
    setEditing(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  // Press and hold my own message: Edit (text only) or Unsend.
  function messageMenu(message: ChatMessage) {
    if (!chat) return;
    const unsend = () =>
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
    Alert.alert(
      t('chat.messageOptions'),
      undefined,
      [
        { text: t('common.cancel'), style: 'cancel' },
        ...(message.kind === 'text'
          ? [
              {
                text: t('chat.edit'),
                onPress: () => {
                  setEditing(message);
                  setDraft(message.body);
                },
              },
            ]
          : []),
        { text: t('chat.unsend'), style: 'destructive' as const, onPress: unsend },
      ],
      { cancelable: true },
    );
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

  async function startVoice() {
    setMenuOpen(false);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('chat.micDenied'));
      return;
    }
    setRecording(true);
  }

  // The + button is in every chat the person can write in.
  const attachShown = Boolean(myId && canSend);

  function openMenu() {
    if (chat) setMenuOpen(true);
    else if (attachHint) Alert.alert(attachHint);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {banner}
      {messages === null ? (
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={[styles.empty, styles.flipped]}>{emptyText ?? t('chat.empty')}</Text>}
          renderItem={({ item, index }) => {
            const mine = item.sender_id === myId;
            // In an inverted list the next item is the older message.
            const older = messages[index + 1];
            const firstOfRun = !older || older.sender_id !== item.sender_id;
            return (
              <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, firstOfRun && styles.rowFirst]}>
                {!mine &&
                  (firstOfRun ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.openProfile', { name: item.sender_name })}
                      hitSlop={4}
                      onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: item.sender_id } })}>
                      <ChatAvatar name={item.sender_name} photoPath={item.sender_avatar} size={AVATAR} />
                    </Pressable>
                  ) : (
                    <View style={styles.avatarSpace} />
                  ))}
                <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs]}>
                  {showNames && !mine && firstOfRun && <Text style={styles.name}>{item.sender_name}</Text>}
                  <MessageContent
                    message={item}
                    mine={mine}
                    chat={chat}
                    onLongPress={mine && chat && item.kind !== 'unsent' ? () => messageMenu(item) : undefined}
                  />
                </View>
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
              <Icon name="edit" size={18} color={Colors.accent} />
              <View style={styles.editText}>
                <Text style={styles.editTitle}>{t('chat.editing')}</Text>
                <Text style={styles.editPreview} numberOfLines={1}>
                  {editing.body}
                </Text>
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
              style={({ pressed }) => [styles.plus, pressed && styles.pressed]}>
              {attaching ? <ActivityIndicator color={Colors.accent} /> : <Icon name="plus" size={26} color={Colors.accent} />}
            </Pressable>
          )}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={Colors.textMuted}
            selectionColor={Colors.orange}
            keyboardAppearance="dark"
            multiline
            maxLength={1000}
            editable={canSend}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            disabled={!canSend || sending || !draft.trim()}
            onPress={send}
            style={({ pressed }) => [styles.send, (!canSend || !draft.trim()) && styles.sendDisabled, pressed && styles.pressed]}>
            {sending ? (
              <ActivityIndicator color={Colors.onBrand} />
            ) : (
              <Icon name={editing ? 'check' : 'send'} size={20} color={canSend && draft.trim() ? Colors.onBrand : Colors.textMuted} />
            )}
          </Pressable>
        </View>
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
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function MessageContent({
  message,
  mine,
  chat,
  onLongPress,
}: {
  message: ChatMessage;
  mine: boolean;
  chat: ChatRef | null;
  onLongPress?: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const time = formatClock(bangkokMinutes(new Date(message.created_at), deviceZone()));
  if (message.kind === 'photo') return <PhotoBubble message={message} mine={mine} onLongPress={onLongPress} />;
  if (message.kind === 'voice') return <VoiceBubble message={message} mine={mine} onLongPress={onLongPress} />;
  if (message.kind === 'location' && chat) {
    return <LocationBubble message={message} mine={mine} chatKind={chat.kind} onLongPress={onLongPress} />;
  }
  if (message.kind === 'unsent') {
    return (
      <View style={[styles.bubble, styles.bubbleUnsent]}>
        <Text style={styles.unsent}>🚫 {mine ? t('chat.youUnsent') : t('chat.unsentMessage')}</Text>
        <Text style={styles.time}>{time}</Text>
      </View>
    );
  }
  return (
    <Pressable onLongPress={onLongPress} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
      <Text style={[styles.time, mine && styles.timeMine]}>{message.edited_at ? `${t('chat.edited')} · ${time}` : time}</Text>
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
        style={({ pressed }) => [styles.plus, pressed && styles.pressed]}>
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
        <Icon name="send" size={20} color={started ? Colors.onBrand : Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl },
  list: { padding: Spacing.lg, gap: Spacing.xs, flexGrow: 1 },
  // FlatList's inverted transform also flips the empty component.
  flipped: { transform: [{ scaleY: -1 }] },
  empty: { ...Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  rowFirst: { marginTop: Spacing.sm },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatarSpace: { width: AVATAR },
  column: { maxWidth: '80%' },
  columnMine: { alignItems: 'flex-end' },
  columnTheirs: { alignItems: 'flex-start' },
  name: { ...Type.small, fontSize: 12, color: Colors.textMuted, marginBottom: 2, marginLeft: Spacing.sm },
  bubble: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg },
  bubbleMine: { backgroundColor: Colors.orange, borderBottomRightRadius: Radius.sm },
  bubbleTheirs: { backgroundColor: Colors.surfaceRaised, borderBottomLeftRadius: Radius.sm },
  bubbleUnsent: { borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
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
  editTitle: { ...Type.label, color: Colors.accent },
  editPreview: { ...Type.small, color: Colors.textSecondary },
  body: { ...Type.body, color: Colors.text },
  bodyMine: { color: Colors.onBrand },
  time: { fontSize: 11, lineHeight: 14, color: Colors.textMuted, alignSelf: 'flex-end', marginTop: 2 },
  timeMine: { color: Colors.onBrand, opacity: 0.75 },
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
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.orange,
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
    borderTopLeftRadius: Radius.lg * 1.5,
    borderTopRightRadius: Radius.lg * 1.5,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  sheetTitle: { ...Type.heading, color: Colors.text, marginTop: Spacing.md },
  options: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.lg },
  option: { flex: 1, alignItems: 'center', gap: Spacing.sm },
  optionIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { ...Type.small, color: Colors.text, textAlign: 'center' },
}));
