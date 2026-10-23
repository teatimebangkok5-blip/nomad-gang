import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { Button } from '@/components/button';
import { LevelBadge } from '@/components/level-badge';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { VenueMap } from '@/components/venue-map';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useCurrentLocation } from '@/lib/location';
import { useFollowing } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';
import { useDiscoverable, useNearbyTravellers, type Traveller } from '@/lib/travellers';

// Travellers: people within 5 km who chose to be visible, where they last opened the app (fuzzy dots + list). Messages are on home's Messages button.
export default function TravellersScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('travellers.title')} />
      <NearbyTab myId={myId} />
    </SafeAreaView>
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
  const following = useFollowing(myId);
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
      renderItem={({ item }) => {
        const followed = following.ids.has(item.user_id);
        return (
          <View style={styles.person}>
            <GlossyFill />
            {/* Name and avatar open the person's profile. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('profile.open')}: ${item.display_name}`}
              onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: item.user_id } })}
              style={({ pressed }) => [styles.personMain, pressed && styles.pressed]}>
              <Avatar name={item.display_name} userId={item.user_id} />
              <View style={styles.personBody}>
                <Text style={styles.personName} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {t('travellers.distance', { km: item.distance_km.toFixed(1) })} · {activeLabel(item.minutes_ago, t)}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: followed }}
              onPress={async () => {
                const error = await following.toggle(item.user_id);
                if (error) Alert.alert(t(`profile.errors.${error}`));
              }}
              style={({ pressed }) => [styles.followButton, followed && styles.followButtonOn, pressed && styles.pressed]}>
              <Text style={[styles.followButtonText, followed && styles.followButtonTextOn]}>
                {followed ? t('profile.unfollow') : t('profile.follow')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('travellers.message')}
              onPress={() => openChat(item)}
              style={({ pressed }) => [styles.messageButton, pressed && styles.pressed]}>
              <Icon name="chat" size={18} color={Colors.onBrand} />
            </Pressable>
          </View>
        );
      }}
    />
  );
}

// People stay listed at the last place they opened the app for 7 days.
function activeLabel(minutes: number, t: TFunction) {
  if (minutes < 5) return t('travellers.activeNow');
  if (minutes < 60) return t('travellers.activeAgo', { min: minutes });
  if (minutes < 24 * 60) return t('travellers.activeHoursAgo', { count: Math.floor(minutes / 60) });
  return t('travellers.activeDaysAgo', { count: Math.floor(minutes / (24 * 60)) });
}

const AVATAR_SIZE = 44;

function Avatar({ name, userId }: { name: string; userId: string }) {
  const styles = useStyles();
  return (
    <View>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase() || '?'}</Text>
      </View>
      <LevelBadge userId={userId} size={AVATAR_SIZE} />
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
    overflow: 'hidden',
    ...Raised,
  },
  pressed: { opacity: 0.7 },
  personMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Colors.orange,
  },
  followButton: {
    minHeight: 38,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Colors.violet,
  },
  followButtonOn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderStrong },
  followButtonText: { ...Type.label, color: Colors.white, fontWeight: '800' },
  followButtonTextOn: { color: Colors.text },
}));
