import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { bangkokMinutes, deviceZone, formatClock } from '@/lib/bangkok-time';
import type { ChatErrorKey, ChatMessage } from '@/lib/chat';
import { makeStyles, useColors } from '@/lib/theme';

// Message list (newest at the bottom) and a composer. Used by table chat and direct messages.
export function ChatView({
  messages,
  myId,
  showNames,
  onSend,
  banner,
  canSend = true,
  emptyText,
}: {
  messages: ChatMessage[] | null;
  myId: string | undefined;
  // Show the sender's name above other people's messages (group chats).
  showNames: boolean;
  onSend: (body: string) => Promise<ChatErrorKey | null>;
  banner?: ReactNode;
  canSend?: boolean;
  emptyText?: string;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatErrorKey | null>(null);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await onSend(body);
    setSending(false);
    if (result) setError(result);
    else setDraft('');
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
          ListEmptyComponent={
            <Text style={[styles.empty, styles.flipped]}>{emptyText ?? t('chat.empty')}</Text>
          }
          renderItem={({ item, index }) => {
            const mine = item.sender_id === myId;
            // In an inverted list the next item is the older message.
            const older = messages[index + 1];
            const firstOfRun = !older || older.sender_id !== item.sender_id;
            return (
              <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
                {showNames && !mine && firstOfRun && <Text style={styles.name}>{item.sender_name}</Text>}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                  <Text style={[styles.time, mine && styles.timeMine]}>
                    {formatClock(bangkokMinutes(new Date(item.created_at), deviceZone()))}
                  </Text>
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

      <View style={styles.composer}>
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
          style={({ pressed }) => [
            styles.send,
            (!canSend || !draft.trim()) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}>
          {sending ? (
            <ActivityIndicator color={Colors.onBrand} />
          ) : (
            <Icon name="send" size={20} color={canSend && draft.trim() ? Colors.onBrand : Colors.textMuted} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl },
  list: { padding: Spacing.lg, gap: Spacing.xs, flexGrow: 1 },
  // FlatList's inverted transform also flips the empty component.
  flipped: { transform: [{ scaleY: -1 }] },
  empty: { ...Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xxl },
  row: { maxWidth: '82%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  name: { ...Type.small, fontSize: 12, color: Colors.textMuted, marginBottom: 2, marginLeft: Spacing.sm, marginTop: Spacing.sm },
  bubble: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg },
  bubbleMine: { backgroundColor: Colors.orange, borderBottomRightRadius: Radius.sm },
  bubbleTheirs: { backgroundColor: Colors.surfaceRaised, borderBottomLeftRadius: Radius.sm },
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
}));
