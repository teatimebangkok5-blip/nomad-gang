import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { VenueMap } from '@/components/venue-map';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatDayLabel, bangkokDay, bangkokMinutes, formatClock } from '@/lib/bangkok-time';
import { useThreads, type ThreadSummary } from '@/lib/chat';
import { useCurrentLocation } from '@/lib/location';
import { makeStyles, useColors } from '@/lib/theme';
import { useDiscoverable, useNearbyTravellers, type Traveller } from '@/lib/travellers';

type Tab = 'nearby' | 'messages';

// Travellers: people within 5 km who chose to be visible (fuzzy dots + list), and the message inbox.
export default function TravellersScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;
  const [tab, setTab] = useState<Tab>('nearby');
  const { threads } = useThreads(Boolean(myId));
  const incoming = (threads ?? []).filter((th) => th.status === 'pending' && th.requested_by !== myId).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('travellers.title')} />
      <View style={styles.tabs}>
        <TabButton label={t('travellers.nearby')} selected={tab === 'nearby'} onPress={() => setTab('nearby')} />
        <TabButton
          label={t('travellers.messages')}
          badge={incoming}
          selected={tab === 'messages'}
          onPress={() => setTab('messages')}
        />
      </View>
      {tab === 'nearby' ? <NearbyTab myId={myId} /> : <MessagesTab threads={threads} myId={myId} />}
    </SafeAreaView>
  );
}

function TabButton({
  label,
  selected,
  badge = 0,
  onPress,
}: {
  label: string;
  selected: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected && styles.tabSelected]}>
      <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{label}</Text>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

function NearbyTab({ myId }: { myId: string | undefined }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const visibility = useDiscoverable(myId);
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const { travellers } = useNearbyTravellers(visibility.on === true && coords !== null, coords);
  const [turningOn, setTurningOn] = useState(false);

  if (visibility.on === null) {
    return <ActivityIndicator color={Colors.accent} style={styles.spinner} />;
  }

  if (!visibility.on) {
    return (
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.optIn}>
          <Icon name="travellers" size={40} color={Colors.accent} />
          <Text style={styles.optInTitle}>{t('travellers.optInTitle')}</Text>
          <Text style={styles.optInBody}>{t('travellers.optInBody')}</Text>
          <Button
            title={t('travellers.turnOn')}
            loading={turningOn}
            onPress={async () => {
              setTurningOn(true);
              await visibility.set(true);
              if (location.state.status !== 'granted') await location.request();
              setTurningOn(false);
            }}
          />
        </View>
      </ScrollView>
    );
  }

  if (!coords) {
    return (
      <View style={[styles.pad, styles.center]}>
        <Text style={styles.muted}>{t('travellers.needLocation')}</Text>
        <Button title={t('travellers.allowLocation')} variant="secondary" onPress={location.request} />
      </View>
    );
  }

  const openChat = (traveller: Traveller) => router.push({ pathname: '/dm/[userId]', params: { userId: traveller.user_id } });

  return (
    <FlatList
      data={travellers ?? []}
      keyExtractor={(traveller) => traveller.user_id}
      contentContainerStyle={styles.pad}
      ListHeaderComponent={
        <View style={styles.mapWrap}>
          <VenueMap
            height={260}
            userCoords={coords}
            pins={(travellers ?? []).map((traveller) => ({
              key: traveller.user_id,
              lat: traveller.fuzzy_lat,
              lng: traveller.fuzzy_lng,
              emoji: '🧑',
              tone: 'violet' as const,
            }))}
            onPinPress={(id) => {
              const traveller = travellers?.find((tr) => tr.user_id === id);
              if (traveller) openChat(traveller);
            }}
          />
          <Text style={styles.hint}>{t('travellers.visibleHint')}</Text>
        </View>
      }
      ListEmptyComponent={
        travellers === null ? (
          <ActivityIndicator color={Colors.accent} style={styles.spinner} />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('travellers.noneNearby')}</Text>
            <Text style={styles.muted}>{t('travellers.noneNearbyBody')}</Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <View style={styles.person}>
          <Avatar name={item.display_name} />
          <View style={styles.personBody}>
            <Text style={styles.personName} numberOfLines={1}>
              {item.display_name}
            </Text>
            <Text style={styles.muted}>
              {t('travellers.distance', { km: item.distance_km.toFixed(1) })} ·{' '}
              {item.minutes_ago < 5 ? t('travellers.activeNow') : t('travellers.activeAgo', { min: item.minutes_ago })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => openChat(item)}
            style={({ pressed }) => [styles.messageButton, pressed && styles.pressed]}>
            <Icon name="chat" size={16} color={Colors.onBrand} />
            <Text style={styles.messageButtonText}>{t('travellers.message')}</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

function MessagesTab({ threads, myId }: { threads: ThreadSummary[] | null; myId: string | undefined }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();

  if (threads === null) {
    return <ActivityIndicator color={Colors.accent} style={styles.spinner} />;
  }

  return (
    <FlatList
      data={threads}
      keyExtractor={(thread) => thread.thread_id}
      contentContainerStyle={styles.pad}
      ListEmptyComponent={
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('travellers.noMessages')}</Text>
          <Text style={styles.muted}>{t('travellers.noMessagesBody')}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const incoming = item.status === 'pending' && item.requested_by !== myId;
        const waiting = item.status === 'pending' && item.requested_by === myId;
        const when = new Date(item.last_message_at);
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/dm/[userId]', params: { userId: item.other_id } })}
            style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
            <Avatar name={item.other_name} />
            <View style={styles.personBody}>
              <View style={styles.threadTop}>
                <Text style={styles.personName} numberOfLines={1}>
                  {item.other_name}
                </Text>
                <Text style={styles.time}>
                  {bangkokDay(when) === bangkokDay(new Date())
                    ? formatClock(bangkokMinutes(when))
                    : formatDayLabel(bangkokDay(when), t)}
                </Text>
              </View>
              <Text style={styles.muted} numberOfLines={1}>
                {item.last_sender === myId ? t('travellers.youPrefix') : ''}
                {item.last_body}
              </Text>
              {(incoming || waiting) && (
                <Text style={[styles.status, incoming && styles.statusIncoming]}>
                  {incoming ? t('travellers.request') : t('travellers.waiting')}
                </Text>
              )}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function Avatar({ name }: { name: string }) {
  const styles = useStyles();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase() || '?'}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  pad: { padding: Spacing.lg, gap: Spacing.sm, flexGrow: 1 },
  center: { alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.xxl },
  spinner: { marginTop: Spacing.xxl },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    padding: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceRaised,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 40,
    borderRadius: Radius.pill,
  },
  tabSelected: { backgroundColor: Colors.orange },
  tabLabel: { ...Type.label, color: Colors.textSecondary },
  tabLabelSelected: { color: Colors.onBrand, fontWeight: '800' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.onBrand },
  optIn: {
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optInTitle: { ...Type.title, color: Colors.text, textAlign: 'center' },
  optInBody: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  mapWrap: { marginBottom: Spacing.md, gap: Spacing.sm },
  hint: { ...Type.small, color: Colors.textMuted },
  muted: { ...Type.small, color: Colors.textSecondary },
  emptyCard: {
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: { opacity: 0.7 },
  personBody: { flex: 1, gap: 2 },
  personName: { ...Type.heading, color: Colors.text, flexShrink: 1 },
  threadTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  time: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  status: { ...Type.small, fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  statusIncoming: { color: Colors.accent },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...Type.heading, color: Colors.text },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.orange,
  },
  messageButtonText: { ...Type.label, color: Colors.onBrand, fontWeight: '800' },
}));
