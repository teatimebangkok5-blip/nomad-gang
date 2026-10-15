import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CategoryFilter, type CategoryFilterValue } from '@/components/category-filter';
import { Icon } from '@/components/icon';
import { LanguageToggle } from '@/components/language-toggle';
import { Logo } from '@/components/logo';
import { MeetupCard } from '@/components/meetup-card';
import { VenueCard } from '@/components/venue-card';
import { VenueMap, type MapPin } from '@/components/venue-map';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { signOut, useAuth } from '@/lib/auth';
import { distanceMeters, useCurrentLocation } from '@/lib/location';
import { joinMeetup, useOpenMeetups } from '@/lib/meetups';
import { skipLogin } from '@/lib/preview';
import { useVenues, type Venue } from '@/lib/venues';

// Home: category chips, a map of open tables, "Create table", the open tables list, then partner places.
export default function HomeScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const venues = useVenues();
  const meetups = useOpenMeetups(Boolean(session));
  const location = useCurrentLocation();
  const [category, setCategory] = useState<CategoryFilterValue>('all');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const venueById = new Map(venues.venues.map((venue) => [venue.id, venue]));
  const inCategory = (venue: Venue | undefined) => Boolean(venue) && (category === 'all' || venue?.category === category);

  const visibleMeetups = meetups.meetups.filter((meetup) => inCategory(venueById.get(meetup.venue_id)));
  const listedMeetups = selectedVenueId
    ? visibleMeetups.filter((meetup) => meetup.venue_id === selectedVenueId)
    : visibleMeetups;

  // One pin per venue that has open tables, with the number of tables as a badge.
  const tableCounts = new Map<string, number>();
  for (const meetup of visibleMeetups) tableCounts.set(meetup.venue_id, (tableCounts.get(meetup.venue_id) ?? 0) + 1);
  const pins: MapPin[] = [...tableCounts].flatMap(([venueId, count]) => {
    const venue = venueById.get(venueId);
    return venue
      ? [{ key: venue.id, lat: venue.lat, lng: venue.lng, category: venue.category, count, selected: venue.id === selectedVenueId }]
      : [];
  });

  const places = venues.venues
    .filter((venue) => inCategory(venue))
    .map((venue) => ({ venue, distance: coords ? distanceMeters(coords, venue) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  const selectedVenue = selectedVenueId ? venueById.get(selectedVenueId) : undefined;

  function confirmSignOut() {
    Alert.alert(t('home.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('home.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  }

  async function handleJoin(id: string) {
    setJoiningId(id);
    const { error } = await joinMeetup(id);
    setJoiningId(null);
    if (error) Alert.alert(t(`tables.errors.${error}`));
    else meetups.reload();
  }

  async function handleRefresh() {
    setRefreshing(true);
    location.refresh();
    await Promise.all([venues.pullToRefresh(), meetups.reload()]);
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[Colors.orange]}
            progressBackgroundColor={Colors.surfaceRaised}
            tintColor={Colors.orange}
          />
        }>
        <View style={styles.topBar}>
          <Logo size={20} />
          <View style={styles.topActions}>
            <LanguageToggle />
            {!skipLogin && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.signOut')}
                hitSlop={8}
                onPress={confirmSignOut}
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
                <Icon name="logout" size={20} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        {skipLogin && (
          // Developer-only notice (English on purpose): reminds that this build skips sign-in.
          <Text style={styles.previewNotice}>Preview mode: sign-in is turned off</Text>
        )}

        <View style={styles.titles}>
          <Text style={styles.title}>{t('home.title')}</Text>
          <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
        </View>

        {location.state.status === 'denied' && (
          <View style={styles.banner}>
            <Icon name="locationOff" size={22} color={Colors.orange} />
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>{t('home.locationOffTitle')}</Text>
              <Text style={styles.bannerBody}>{t('home.locationOffBody')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={location.request}
              style={({ pressed }) => [styles.bannerButton, pressed && styles.iconButtonPressed]}>
              <Text style={styles.bannerButtonText}>
                {location.state.canAskAgain ? t('home.locationTurnOn') : t('home.locationOpenSettings')}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.filter}>
          <CategoryFilter
            value={category}
            onChange={(value) => {
              setCategory(value);
              setSelectedVenueId(null);
            }}
          />
        </View>

        <View style={styles.section}>
          <VenueMap
            pins={pins}
            userCoords={coords}
            height={300}
            onPinPress={(venueId) => setSelectedVenueId((current) => (current === venueId ? null : venueId))}
          />
          <View style={styles.createButton}>
            <Button title={t('tables.createTable')} onPress={() => router.push('/create-table')} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} numberOfLines={1}>
              {selectedVenue
                ? t('tables.tablesAt', { venue: localized(selectedVenue, 'name', currentLanguage()) })
                : t('tables.openTables')}
            </Text>
            {selectedVenue && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSelectedVenueId(null)}>
                <Text style={styles.link}>{t('tables.showAll')}</Text>
              </Pressable>
            )}
          </View>

          {!session ? (
            <Text style={styles.note}>{t('tables.errors.auth_required')}</Text>
          ) : meetups.status === 'loading' ? (
            <ActivityIndicator color={Colors.orange} style={styles.spinner} />
          ) : meetups.status === 'error' ? (
            <Text style={styles.note}>{t('tables.errorLoad')}</Text>
          ) : listedMeetups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('tables.noTablesTitle')}</Text>
              <Text style={styles.emptyBody}>{t('tables.noTablesBody')}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {listedMeetups.map((meetup) => (
                <MeetupCard
                  key={meetup.id}
                  meetup={meetup}
                  venue={venueById.get(meetup.venue_id)}
                  joining={joiningId === meetup.id}
                  onJoin={() => handleJoin(meetup.id)}
                  onPress={() => router.push({ pathname: '/table/[id]', params: { id: meetup.id } })}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('tables.partnerPlaces')}</Text>
          {places.length === 0 ? (
            <EmptyState status={venues.status} onRetry={venues.retry} />
          ) : (
            <View style={styles.list}>
              {places.map(({ venue, distance }) => (
                <VenueCard key={venue.id} venue={venue} distance={distance} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ status, onRetry }: { status: 'loading' | 'ready' | 'error'; onRetry: () => void }) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return <ActivityIndicator color={Colors.orange} size="large" style={styles.spinner} />;
  }

  const isError = status === 'error';
  return (
    <View style={styles.empty}>
      <Icon name={isError ? 'error' : 'store'} size={40} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>{isError ? t('home.errorTitle') : t('home.emptyTitle')}</Text>
      <Text style={styles.emptyBody}>{isError ? t('home.errorBody') : t('home.emptyBody')}</Text>
      {isError && (
        <View style={styles.retry}>
          <Button title={t('common.tryAgain')} variant="secondary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: Spacing.xxl * 2 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: { backgroundColor: Colors.pressed },
  previewNotice: {
    ...Type.small,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceRaised,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  titles: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xl, gap: Spacing.xs },
  title: { ...Type.title, color: Colors.text },
  subtitle: { ...Type.body, color: Colors.textSecondary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.violetTint,
    borderWidth: 1,
    borderColor: Colors.violet,
  },
  bannerText: { flex: 1 },
  bannerTitle: { ...Type.label, color: Colors.text },
  bannerBody: { ...Type.small, color: Colors.textSecondary },
  bannerButton: {
    paddingHorizontal: Spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Colors.orange,
  },
  bannerButtonText: { ...Type.label, color: Colors.onBrand },
  filter: { marginTop: Spacing.lg },
  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xl },
  createButton: { marginTop: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  sectionTitle: { ...Type.heading, color: Colors.text, flexShrink: 1, marginBottom: Spacing.md },
  link: { ...Type.label, color: Colors.orange, marginBottom: Spacing.md },
  list: { gap: Spacing.md },
  note: { ...Type.body, color: Colors.textSecondary },
  spinner: { marginVertical: Spacing.xl },
  emptyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  empty: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { ...Type.heading, color: Colors.text },
  emptyBody: { ...Type.body, color: Colors.textSecondary },
  retry: { marginTop: Spacing.md, alignSelf: 'stretch' },
});
