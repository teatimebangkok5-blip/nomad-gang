import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatAvatar } from '@/components/chat-avatar';
import { Chip } from '@/components/chip';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { currentLanguage, type Language } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { bangkokDay, bangkokMinutes, deviceZone, formatClock, formatDayLabel } from '@/lib/bangkok-time';
import { leaveChat, useChats, type ChatKind, type ChatSummary } from '@/lib/messages';
import { makeStyles, useColors } from '@/lib/theme';
import type { TFunction } from 'i18next';

type Filter = 'all' | ChatKind;
const FILTERS: Filter[] = ['all', 'dm', 'group', 'meetup'];

// All my chats in one list: private chats, group chats, and table / hangout chats (also after they end, until I
// leave them). Newest first, with unread counts. Press and hold a chat to delete or leave it.
export default function MessagesScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { chats, reload } = useChats(Boolean(session));
  const [filter, setFilter] = useState<Filter>('all');

  const shown = (chats ?? []).filter((chat) => filter === 'all' || chat.chat_kind === filter);

  function open(chat: ChatSummary) {
    if (chat.chat_kind === 'dm' && chat.other_id) {
      router.push({ pathname: '/dm/[userId]', params: { userId: chat.other_id } });
    } else if (chat.chat_kind === 'meetup') {
      router.push({ pathname: '/table-chat/[id]', params: { id: chat.chat_id } });
    } else if (chat.chat_kind === 'group') {
      router.push({ pathname: '/group/[id]', params: { id: chat.chat_id } });
    }
  }

  function confirmLeave(chat: ChatSummary) {
    const name = chatTitle(chat, t, language);
    const leave = async () => {
      const error = await leaveChat(chat.chat_kind, chat.chat_id);
      if (error) Alert.alert(t(`messages.errors.${error}`));
      reload();
    };
    if (chat.chat_kind === 'meetup' && !chat.ended) {
      Alert.alert(name, t('messages.leaveAfterEnd'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('messages.openTable'), onPress: () => router.push({ pathname: '/table/[id]', params: { id: chat.chat_id } }) },
      ]);
      return;
    }
    const [title, body, action] =
      chat.chat_kind === 'dm'
        ? [t('messages.deleteChat'), t('messages.deleteChatBody', { name }), t('messages.delete')]
        : chat.chat_kind === 'group'
          ? [t('messages.leaveGroup'), t('messages.leaveGroupBody', { name }), t('messages.leave')]
          : [t('messages.leaveChat'), t('messages.leaveChatBody', { name }), t('messages.leave')];
    Alert.alert(title, body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: action, style: 'destructive', onPress: leave },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={t('messages.title')}
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/new-group')}
            style={({ pressed }) => [styles.newGroup, pressed && styles.pressed]}>
            <GlossyFill />
            <Icon name="group" size={18} color={Colors.accent} />
            <Text style={styles.newGroupText}>{t('messages.newGroup')}</Text>
          </Pressable>
        }
      />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((option) => (
            <Chip key={option} label={t(`messages.filter.${option}`)} selected={filter === option} onPress={() => setFilter(option)} />
          ))}
        </ScrollView>
      </View>

      {chats === null ? (
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(chat) => `${chat.chat_kind}:${chat.chat_id}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={shown.length > 0 ? <Text style={styles.hint}>{t('messages.holdHint')}</Text> : null}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <GlossyFill />
              <Text style={styles.emptyTitle}>{t('messages.emptyTitle')}</Text>
              <Text style={styles.muted}>{t('messages.emptyBody')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ChatRow chat={item} myId={myId} onPress={() => open(item)} onLongPress={() => confirmLeave(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

// A table is named by its title, else its place; a hangout by its title.
function chatTitle(chat: ChatSummary, t: TFunction, language: Language): string {
  if (chat.chat_kind !== 'meetup') return chat.title || '—';
  const place =
    (language === 'th' ? chat.venue_name_th || chat.place_name_th : chat.venue_name_en || chat.place_name_en) ||
    chat.venue_name_en ||
    chat.place_name ||
    '';
  if (chat.meetup_kind === 'hangout') return chat.title || place || t('hangouts.hangout');
  return chat.title ? `${chat.title} · ${place}` : place || t('chat.openChat');
}

function formatTime(iso: string, t: TFunction): string {
  const when = new Date(iso);
  const zone = deviceZone();
  return bangkokDay(when, zone) === bangkokDay(new Date(), zone)
    ? formatClock(bangkokMinutes(when, zone))
    : formatDayLabel(bangkokDay(when, zone), t, undefined, zone);
}

function ChatRow({
  chat,
  myId,
  onPress,
  onLongPress,
}: {
  chat: ChatSummary;
  myId: string | undefined;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = currentLanguage();
  const title = chatTitle(chat, t, language);
  const unread = chat.unread_count > 0;

  const tag =
    chat.chat_kind === 'dm'
      ? chat.dm_status === 'pending'
        ? chat.requested_by === myId
          ? t('travellers.waiting')
          : t('travellers.request')
        : null
      : chat.chat_kind === 'group'
        ? t('messages.people', { count: chat.member_count })
        : [
            chat.meetup_kind === 'hangout' ? `🙌 ${t('hangouts.hangout')}` : `👥 ${t('messages.table')}`,
            chat.cancelled ? t('messages.cancelled') : chat.ended ? t('messages.ended') : null,
          ]
            .filter(Boolean)
            .join(' · ');

  // Photos, voice notes and live locations have no text; name them instead.
  const lastText =
    chat.last_kind === 'photo'
      ? t('messages.lastPhoto')
      : chat.last_kind === 'voice'
        ? t('messages.lastVoice')
        : chat.last_kind === 'location'
          ? t('messages.lastLocation')
          : chat.last_body;
  const preview = lastText
    ? `${chat.last_sender_id === myId ? t('travellers.youPrefix') : chat.chat_kind !== 'dm' && chat.last_sender_name ? `${chat.last_sender_name}: ` : ''}${lastText}`
    : t('messages.noMessagesYet');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `${title}, ${t('messages.unreadA11y', { count: chat.unread_count })}` : title}
      accessibilityHint={t('messages.holdHint')}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}>
      <GlossyFill />
      <ChatAvatar
        name={title}
        photoPath={chat.chat_kind === 'dm' ? chat.other_avatar : null}
        emoji={chat.chat_kind === 'group' ? chat.emoji : chat.chat_kind === 'meetup' ? (chat.meetup_kind === 'hangout' ? '🙌' : '👥') : null}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, unread && styles.bold]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.time, unread && styles.timeUnread]}>{formatTime(chat.last_at, t)}</Text>
        </View>
        <View style={styles.rowTop}>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {preview}
          </Text>
          {unread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{chat.unread_count > 99 ? '99+' : chat.unread_count}</Text>
            </View>
          )}
        </View>
        {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  pressed: { opacity: 0.7 },
  spinner: { marginTop: Spacing.xxl },
  newGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  newGroupText: { ...Type.label, color: Colors.text },
  filters: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  list: { padding: Spacing.lg, paddingTop: Spacing.xs, gap: Spacing.sm, flexGrow: 1 },
  hint: { ...Type.small, color: Colors.textMuted, marginBottom: Spacing.xs },
  emptyCard: {
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  muted: { ...Type.body, color: Colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  rowUnread: { borderColor: Colors.pink },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  rowTitle: { ...Type.heading, fontSize: 16, color: Colors.text, flexShrink: 1 },
  bold: { fontWeight: '800' },
  time: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  timeUnread: { color: Colors.accent, fontWeight: '700' },
  preview: { ...Type.small, color: Colors.textSecondary, flex: 1 },
  previewUnread: { color: Colors.text, fontWeight: '600' },
  tag: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: Colors.white },
}));
