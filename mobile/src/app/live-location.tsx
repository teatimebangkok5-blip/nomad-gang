import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ChatAvatar } from '@/components/chat-avatar';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { VenueMap, type MapFocus } from '@/components/venue-map';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { bangkokMinutes, deviceZone, formatClock } from '@/lib/bangkok-time';
import { stopLiveLocation } from '@/lib/chat-media';
import type { ChatKind } from '@/lib/messages';
import { directionsUrl } from '@/lib/meetups';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { makeStyles, useColors } from '@/lib/theme';

const TABLES: Record<ChatKind, 'meetup_messages' | 'direct_messages' | 'chat_group_messages'> = {
  meetup: 'meetup_messages',
  dm: 'direct_messages',
  group: 'chat_group_messages',
};

type LiveRow = {
  id: string;
  sender_id: string;
  lat: number;
  lng: number;
  live_until: string;
  location_updated_at: string | null;
  profiles: { display_name: string; avatar_path: string | null } | null;
};

function clock(iso: string) {
  return formatClock(bangkokMinutes(new Date(iso), deviceZone()));
}

// A live location from a chat on a map. Follows it while it's being shared (Realtime updates of the message).
export default function LiveLocationScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { kind, messageId } = useLocalSearchParams<{ kind: ChatKind; messageId: string }>();
  const { session } = useAuth();
  const table = TABLES[kind] ?? 'meetup_messages';
  const [row, setRow] = useState<LiveRow | null | 'missing'>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    supabase
      .from(table)
      .select('id, sender_id, lat, lng, live_until, location_updated_at, profiles(display_name, avatar_path)')
      .eq('id', messageId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Loading live location failed', error.message);
        const found = data as unknown as LiveRow | null;
        setRow(found && found.lat !== null ? found : 'missing');
      });
  }, [table, messageId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(uniqueChannelName(`live-${messageId}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `id=eq.${messageId}` }, load)
      .subscribe();
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [table, messageId, load]);

  if (row === null || row === 'missing') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title={t('chat.liveLocationTitle')} />
        {row === null ? (
          <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
        ) : (
          <Text style={styles.center}>{t('chat.notFoundLocation')}</Text>
        )}
      </SafeAreaView>
    );
  }

  const mine = row.sender_id === session?.user.id;
  const name = row.profiles?.display_name ?? '';
  const live = new Date(row.live_until).getTime() > now;
  const updated = row.location_updated_at ? new Date(row.location_updated_at).getTime() : null;
  const minutesAgo = updated ? Math.floor((now - updated) / 60000) : null;
  const focus: MapFocus = { lat: row.lat, lng: row.lng, zoom: 16, seq: updated ?? 0 };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={mine ? t('chat.yourLocation') : t('chat.locationOf', { name })} />
      <View style={styles.flex}>
        <VenueMap
          fullScreen
          pins={[{ key: 'live', lat: row.lat, lng: row.lng, emoji: '📍', label: name, tone: 'violet' }]}
          onPinPress={() => {}}
          userCoords={null}
          focus={focus}
          initialZoom={15}
          mapPadding={{ top: 0, right: 0, bottom: 180, left: 0 }}
        />
        <View style={styles.card}>
          <GlossyFill />
          <View style={styles.cardTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.openProfile', { name })}
              onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: row.sender_id } })}>
              <ChatAvatar name={name} photoPath={row.profiles?.avatar_path} size={48} userId={row.sender_id} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.status, live && styles.statusLive]}>
                {live ? t('chat.liveUntil', { time: clock(row.live_until) }) : t('chat.liveEnded')}
              </Text>
              {minutesAgo !== null && (
                <Text style={styles.meta}>
                  {minutesAgo < 1
                    ? t('chat.updatedJustNow')
                    : minutesAgo < 60
                      ? t('chat.updatedMinutes', { count: minutesAgo })
                      : t('chat.updatedAt', { time: clock(row.location_updated_at as string) })}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                title={t('tables.openInMaps')}
                variant="secondary"
                icon={<Icon name="map" size={18} color={Colors.text} />}
                onPress={() => Linking.openURL(directionsUrl({ lat: row.lat, lng: row.lng, name }))}
              />
            </View>
            {mine && live && (
              <View style={styles.flex}>
                <Button title={t('chat.stopSharing')} onPress={() => stopLiveLocation(kind, row.id).then(load)} />
              </View>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { ...Type.body, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xxl },
  card: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  name: { ...Type.heading, color: Colors.text },
  status: { ...Type.label, color: Colors.textMuted },
  statusLive: { color: Colors.violet },
  meta: { ...Type.small, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
}));
