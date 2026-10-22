import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { type Language, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useCurrentLocation } from '@/lib/location';
import { markNotificationsSeen, useNotifications, type AppNotification } from '@/lib/notifications';
import { profilePhotoUrl } from '@/lib/photos';
import { HANGOUT_CATEGORIES, PROMOTION_EMOJI } from '@/lib/venues';
import { makeStyles, useColors } from '@/lib/theme';
import { emojiPreview } from '@/lib/tm-emoji';

const KIND_EMOJI: Record<AppNotification['kind'], string> = {
  new_table: '👥',
  new_hangout: '🙌',
  joined: '👋',
  join_request: '🔒',
  request_approved: '✅',
  chat_message: '💬',
  direct_message: '✉️',
  dm_request: '✉️',
  follow: '➕',
  promotion: '🏷️',
  reward: '🎁',
  table_invite: '🍻',
};

// Notifications: new tables and hangouts, people joining yours, messages, new followers and new venue deals and
// events. Opening this page marks them all as seen (the bell's badge clears); tap one to open it.
export default function NotificationsScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { session } = useAuth();
  const location = useCurrentLocation();
  const notifications = useNotifications(
    Boolean(session),
    location.state.status === 'granted' ? location.state.coords : null,
  );
  const marked = useRef(false);

  // Once the list has loaded, everything in it counts as seen. The dots stay for this visit.
  const ready = notifications.state.status === 'ready';
  useEffect(() => {
    if (!ready || marked.current) return;
    marked.current = true;
    markNotificationsSeen();
  }, [ready]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('notifications.title')} />
      {notifications.state.status === 'loading' ? (
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      ) : notifications.state.status === 'error' ? (
        <View style={styles.center}>
          <Icon name="error" size={40} color={Colors.textMuted} />
          <Text style={styles.centerText}>{t('notifications.errorLoad')}</Text>
          <Button title={t('common.tryAgain')} variant="secondary" onPress={notifications.reload} />
        </View>
      ) : (
        <FlatList
          data={notifications.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationRow item={item} />}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={notifications.reload}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="notifications" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('notifications.emptyTitle')}</Text>
              <Text style={styles.centerText}>{t('notifications.emptyBody')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function NotificationRow({ item }: { item: AppNotification }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const { title, detail } = notificationText(item, t, language);
  const emoji =
    item.kind === 'promotion' && item.promo_kind
      ? PROMOTION_EMOJI[item.promo_kind]
      : item.kind === 'new_table' && item.meetup_kind === 'event'
        ? '🎟️'
        : KIND_EMOJI[item.kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail ?? ''}`}
      onPress={() => openNotification(item)}
      style={({ pressed }) => [styles.row, item.unread && styles.rowUnread, pressed && styles.pressed]}>
      <GlossyFill />
      <View style={styles.avatar}>
        {item.actor_avatar ? (
          <Image source={profilePhotoUrl(item.actor_avatar)} style={styles.avatarImage} contentFit="cover" />
        ) : item.actor_name ? (
          <Text style={styles.avatarText}>{item.actor_name.slice(0, 1).toUpperCase()}</Text>
        ) : (
          <Text style={styles.avatarEmoji}>{emoji}</Text>
        )}
        {(item.actor_avatar || item.actor_name) && (
          <View style={styles.badge}>
            <Text style={styles.badgeEmoji}>{emoji}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        <Text style={styles.time}>{timeAgo(item.at, t)}</Text>
      </View>
      {item.unread && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

function openNotification(item: AppNotification) {
  switch (item.kind) {
    case 'new_table':
    case 'new_hangout':
    case 'joined':
    case 'join_request':
    case 'request_approved':
    case 'table_invite':
      if (item.meetup_id) router.push({ pathname: '/table/[id]', params: { id: item.meetup_id } });
      return;
    case 'chat_message':
      if (item.meetup_id) router.push({ pathname: '/table-chat/[id]', params: { id: item.meetup_id } });
      return;
    case 'direct_message':
    case 'dm_request':
      if (item.actor_id) router.push({ pathname: '/dm/[userId]', params: { userId: item.actor_id } });
      return;
    case 'follow':
      if (item.actor_id) router.push({ pathname: '/profile/[userId]', params: { userId: item.actor_id } });
      return;
    case 'reward':
      router.push('/rewards');
      return;
    case 'promotion':
      if (!item.venue_id) return;
      if (item.venue_category && (HANGOUT_CATEGORIES as readonly string[]).includes(item.venue_category)) {
        router.push({ pathname: '/create-hangout', params: { venueId: item.venue_id } });
      } else {
        router.push({ pathname: '/create-table', params: { venueId: item.venue_id } });
      }
  }
}

function pick(en: string | null, th: string | null, language: Language): string | null {
  return (language === 'th' ? th || en : en || th) || null;
}

// The two lines of a notification, e.g. "Mai created a hangout: Night market walk" / "Chatuchak Market".
function notificationText(item: AppNotification, t: TFunction, language: Language): { title: string; detail: string | null } {
  const name = item.actor_name || t('notifications.someone');
  const place = pick(item.venue_name_en, item.venue_name_th, language) ?? pick(item.place_name_en, item.place_name_th, language) ?? item.place_name;
  const meetupLabel = item.title || place || '';
  switch (item.kind) {
    case 'new_table':
      // The server lists new events as new_table with meetup_kind 'event'.
      if (item.meetup_kind === 'event') {
        return { title: t('notifications.newEvent', { name, title: item.title ?? '' }), detail: place };
      }
      return { title: t('notifications.newTable', { name, place: place ?? '' }), detail: item.title || null };
    case 'new_hangout':
      return { title: t('notifications.newHangout', { name, title: item.title ?? '' }), detail: place };
    case 'joined':
      return {
        title:
          item.meetup_kind === 'event'
            ? t('notifications.joinedEvent', { name })
            : item.meetup_kind === 'hangout'
              ? t('notifications.joinedHangout', { name })
              : t('notifications.joinedTable', { name }),
        detail: meetupLabel || null,
      };
    case 'join_request':
      return {
        title:
          item.meetup_kind === 'event'
            ? t('notifications.joinRequestEvent', { name })
            : item.meetup_kind === 'hangout'
              ? t('notifications.joinRequestHangout', { name })
              : t('notifications.joinRequestTable', { name }),
        detail: meetupLabel || null,
      };
    case 'request_approved':
      return { title: t('notifications.requestApproved', { name }), detail: meetupLabel || null };
    case 'table_invite':
      return { title: t('notifications.tableInvite', { name }), detail: meetupLabel || null };
    case 'chat_message':
      return { title: t('notifications.chatMessage', { name, chat: meetupLabel }), detail: item.body && emojiPreview(item.body, language) };
    case 'direct_message':
      return { title: t('notifications.directMessage', { name }), detail: item.body && emojiPreview(item.body, language) };
    case 'dm_request':
      return { title: t('notifications.dmRequest', { name }), detail: item.body && emojiPreview(item.body, language) };
    case 'follow':
      return { title: t('notifications.follow', { name }), detail: null };
    case 'reward':
      return { title: t('notifications.reward'), detail: meetupLabel || null };
    case 'promotion': {
      const venue = place ?? '';
      const key =
        item.promo_kind === 'event'
          ? 'promoEvent'
          : item.promo_kind === 'party'
            ? 'promoParty'
            : item.promo_kind === 'ticket'
              ? 'promoTicket'
              : item.promo_kind === 'free_entry'
                ? 'promoFreeEntry'
                : 'promoDiscount';
      return { title: t(`notifications.${key}`, { venue }), detail: pick(item.promo_title_en, item.promo_title_th, language) };
    }
  }
}

function timeAgo(at: string, t: TFunction): string {
  const minutes = Math.floor((Date.now() - new Date(at).getTime()) / 60000);
  if (minutes < 1) return t('notifications.justNow');
  if (minutes < 60) return t('notifications.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.hoursAgo', { count: hours });
  return t('notifications.daysAgo', { count: Math.floor(hours / 24) });
}

const AVATAR = 44;

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  emptyTitle: { ...Type.heading, color: Colors.text, textAlign: 'center' },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xxl * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  rowUnread: { borderColor: Colors.violet, backgroundColor: Colors.violetTint },
  pressed: { opacity: 0.7 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarText: { ...Type.heading, color: Colors.text },
  avatarEmoji: { fontSize: 22 },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeEmoji: { fontSize: 12 },
  body: { flex: 1, gap: 2 },
  title: { ...Type.label, color: Colors.text },
  detail: { ...Type.small, color: Colors.textSecondary },
  time: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.pink },
}));
