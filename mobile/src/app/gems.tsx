import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { GemCard } from '@/components/gem-card';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { MapHeader } from '@/components/map-header';
import { SlideUpPanel } from '@/components/slide-up-panel';
import { VenueMap, type MapPin } from '@/components/venue-map';
import { RequirePlus } from '@/components/require-plus';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { GEM_BUDGETS, GEM_CATEGORIES, GEM_CATEGORY_EMOJI, matchesBudget, useGems, type GemBudget, type GemCategory } from '@/lib/gems';
import { BANGKOK_CENTER, inBangkok, useCurrentLocation } from '@/lib/location';
import { makeStyles, useColors } from '@/lib/theme';

// Plus only (TableMeet Plus); people without Plus see the Plus page.
export default function GemsScreenRoute() {
  return (
    <RequirePlus>
      <GemsScreen />
    </RequirePlus>
  );
}

// Hidden Gems map: the curated Bangkok places tourists often miss, filtered by area, category, budget or saved.
// Tap a gem for its card; "List" shows them all. Users can suggest a place.
function GemsScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const { gems } = useGems();
  const [area, setArea] = useState<string | null>(null);
  const [category, setCategory] = useState<GemCategory | null>(null);
  const [budget, setBudget] = useState<GemBudget>('any');
  const [savedOnly, setSavedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const all = gems ?? [];
  const areas = [...new Map(all.map((gem) => [gem.area_en, language === 'th' ? gem.area_th : gem.area_en])).entries()];
  const shown = all.filter(
    (gem) =>
      (area === null || gem.area_en === area) &&
      (category === null || gem.category === category) &&
      matchesBudget(gem, budget) &&
      (!savedOnly || gem.saved),
  );
  const selected = shown.find((gem) => gem.id === selectedId) ?? null;
  const visited = all.filter((gem) => gem.visited).length;

  const pins: MapPin[] = shown.map((gem) => ({
    key: gem.id,
    lat: gem.lat,
    lng: gem.lng,
    emoji: GEM_CATEGORY_EMOJI[gem.category],
    tone: 'violet',
    selected: gem.id === selectedId,
  }));

  return (
    <View style={styles.root}>
      <VenueMap
        fullScreen
        pins={pins}
        onPinPress={setSelectedId}
        onMapPress={() => setSelectedId(null)}
        userCoords={coords ?? null}
        // The gems are in Bangkok: someone outside Bangkok starts there, not on their own location.
        center={coords && !inBangkok(coords) ? BANGKOK_CENTER : null}
        mapPadding={{ top: topHeight, right: 0, bottom: bottomHeight, left: 0 }}
        initialZoom={12}
      />

      <MapHeader
        title={t('gems.title')}
        hint={t('gems.visitedCount', { count: visited, total: all.length })}
        onHeight={setTopHeight}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('gems.allAreas')} selected={area === null} onPress={() => setArea(null)} />
          {areas.map(([key, label]) => (
            <Chip key={key} label={label} selected={area === key} onPress={() => setArea(area === key ? null : key)} />
          ))}
          <Chip label={`♥ ${t('gems.saved')}`} selected={savedOnly} onPress={() => setSavedOnly(!savedOnly)} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, styles.secondRow]}>
          {GEM_CATEGORIES.map((option) => (
            <Chip
              key={option}
              label={`${GEM_CATEGORY_EMOJI[option]} ${t(`gems.categories.${option}`)}`}
              selected={category === option}
              onPress={() => setCategory(category === option ? null : option)}
            />
          ))}
          {GEM_BUDGETS.filter((option) => option !== 'any').map((option) => (
            <Chip
              key={option}
              label={t(`gems.budgets.${option}`)}
              selected={budget === option}
              onPress={() => setBudget(budget === option ? 'any' : option)}
            />
          ))}
        </ScrollView>
      </MapHeader>

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.md }]}
        pointerEvents="box-none"
        onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
        {gems === null ? (
          <ActivityIndicator color={Colors.accent} />
        ) : selected ? (
          <GemCard gem={selected} mapsLink onPress={() => router.push({ pathname: '/gem/[id]', params: { id: selected.id } })} />
        ) : shown.length === 0 ? (
          <View style={styles.empty}>
            <GlossyFill />
            <Text style={styles.emptyText}>{t('gems.noMatch')}</Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/suggest-gem')}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <GlossyFill />
            <Icon name="add" size={20} color={Colors.text} />
            <Text style={styles.actionText}>{t('gems.suggest')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setListOpen(true)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <GlossyFill />
            <Icon name="list" size={20} color={Colors.text} />
            <Text style={styles.actionText}>{t('gems.list', { count: shown.length })}</Text>
          </Pressable>
        </View>
      </View>

      <SlideUpPanel open={listOpen} onClose={() => setListOpen(false)} title={t('gems.title')} subtitle={t('gems.intro')}>
        <ScrollView contentContainerStyle={styles.sheet}>
          <View style={styles.list}>
            {shown.map((gem) => (
              <GemCard
                key={gem.id}
                gem={gem}
                onPress={() => {
                  setListOpen(false);
                  router.push({ pathname: '/gem/[id]', params: { id: gem.id } });
                }}
              />
            ))}
          </View>
        </ScrollView>
      </SlideUpPanel>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  root: { flex: 1, backgroundColor: Colors.bg },
  chips: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  secondRow: { marginTop: Spacing.sm },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: Spacing.md, paddingHorizontal: Spacing.lg },
  empty: { padding: Spacing.lg, borderRadius: Radius.lg, backgroundColor: Colors.surface, overflow: 'hidden' },
  emptyText: { ...Type.body, color: Colors.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  pressed: { opacity: 0.8 },
  actionText: { ...Type.label, color: Colors.text },
  sheet: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  list: { gap: Spacing.md },
}));
