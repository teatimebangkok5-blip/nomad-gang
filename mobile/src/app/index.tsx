import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CategoryFilter, type CategoryFilterValue } from '@/components/category-filter';
import { Icon } from '@/components/icon';
import { LanguageToggle } from '@/components/language-toggle';
import { VenueCard } from '@/components/venue-card';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { distanceMeters, useCurrentLocation } from '@/lib/location';
import { useVenues } from '@/lib/venues';

// Home: partner venues near the user, nearest first, with each venue's TableMeet deal.
export default function HomeScreen() {
  const { t } = useTranslation();
  const venues = useVenues();
  const location = useCurrentLocation();
  const [category, setCategory] = useState<CategoryFilterValue>('all');

  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const items = venues.venues
    .filter((venue) => category === 'all' || venue.category === category)
    .map((venue) => ({ venue, distance: coords ? distanceMeters(coords, venue) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  function confirmSignOut() {
    Alert.alert(t('home.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('home.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>
          Table<Text style={styles.logoAccent}>Meet</Text>
        </Text>
        <View style={styles.topActions}>
          <LanguageToggle />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.signOut')}
            hitSlop={8}
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
            <Icon name="logout" size={20} color={Colors.ink600} />
          </Pressable>
        </View>
      </View>

      <View style={styles.titles}>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
      </View>

      {location.state.status === 'denied' && (
        <View style={styles.banner}>
          <Icon name="locationOff" size={22} color={Colors.brand600} />
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
        <CategoryFilter value={category} onChange={setCategory} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.venue.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <VenueCard venue={item.venue} distance={item.distance} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState status={venues.status} onRetry={venues.retry} title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={venues.refreshing}
            onRefresh={() => {
              venues.pullToRefresh();
              location.refresh();
            }}
            colors={[Colors.brand600]}
          />
        }
      />
    </SafeAreaView>
  );
}

function EmptyState({
  status,
  onRetry,
  title,
  body,
}: {
  status: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  title: string;
  body: string;
}) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={Colors.brand600} size="large" />
      </View>
    );
  }

  const isError = status === 'error';
  return (
    <View style={styles.empty}>
      <Icon name={isError ? 'error' : 'store'} size={40} color={Colors.ink400} />
      <Text style={styles.emptyTitle}>{isError ? t('home.errorTitle') : title}</Text>
      <Text style={styles.emptyBody}>{isError ? t('home.errorBody') : body}</Text>
      {isError && (
        <View style={styles.retry}>
          <Button title={t('common.tryAgain')} variant="secondary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.ink50 },
  list: { paddingBottom: Spacing.xxl, flexGrow: 1 },
  header: { paddingBottom: Spacing.md },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  logo: { fontSize: 20, fontWeight: '800', color: Colors.ink900, letterSpacing: -0.3 },
  logoAccent: { color: Colors.brand600 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: { backgroundColor: Colors.ink100 },
  titles: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xl, gap: Spacing.xs },
  title: { ...Type.title, color: Colors.ink900 },
  subtitle: { ...Type.body, color: Colors.ink600 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand50,
    borderWidth: 1,
    borderColor: Colors.brand100,
  },
  bannerText: { flex: 1 },
  bannerTitle: { ...Type.label, color: Colors.ink900 },
  bannerBody: { ...Type.small, color: Colors.ink600 },
  bannerButton: {
    paddingHorizontal: Spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Colors.white,
  },
  bannerButtonText: { ...Type.label, color: Colors.brand700 },
  filter: { marginTop: Spacing.lg },
  item: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  empty: { alignItems: 'center', paddingHorizontal: Spacing.xxl, paddingTop: Spacing.xxl * 1.5, gap: Spacing.sm },
  emptyTitle: { ...Type.heading, color: Colors.ink900, textAlign: 'center', marginTop: Spacing.sm },
  emptyBody: { ...Type.body, color: Colors.ink600, textAlign: 'center' },
  retry: { marginTop: Spacing.md, alignSelf: 'stretch' },
});
