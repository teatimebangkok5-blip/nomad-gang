import { Image } from 'expo-image';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { CATEGORY_EMOJI } from '@/components/venue-map';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { areaName, type SearchResult } from '@/lib/map-search';
import { PLACE_ICON_IMAGES } from '@/lib/place-icons';
import { placeIcon, placeName } from '@/lib/places';
import { makeStyles, useColors } from '@/lib/theme';
import { PROMOTION_EMOJI } from '@/lib/venues';

// The search field in a map screen's floating header.
export function MapSearchBar({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={styles.bar}>
      <GlossyFill />
      <Icon name="search" size={20} color={Colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        selectionColor={Colors.orange}
        keyboardAppearance="dark"
        returnKeyType="search"
        autoCorrect={false}
        maxLength={60}
        accessibilityLabel={placeholder}
        style={styles.input}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('search.clear')}
          hitSlop={10}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
          <Text style={styles.clearText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

// The results list, drawn over the map just below the header (`top`). Render it at the screen's top level so it can
// be tapped on Android (touches outside a parent's bounds are ignored there).
export function MapSearchResults({
  visible,
  searching,
  results,
  top,
  onPick,
  onClose,
}: {
  visible: boolean;
  searching: boolean;
  results: SearchResult[];
  top: number;
  onPick: (result: SearchResult) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();

  // Android back closes the results first.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View style={[styles.panel, { top }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        {results.map((result) => (
          <ResultRow
            key={resultKey(result)}
            result={result}
            onPress={() => {
              Keyboard.dismiss();
              onPick(result);
            }}
          />
        ))}
        {searching && <ActivityIndicator color={Colors.accent} style={styles.spinner} />}
        {!searching && results.length === 0 && <Text style={styles.empty}>{t('search.noResults')}</Text>}
      </ScrollView>
    </View>
  );
}

function resultKey(result: SearchResult): string {
  if (result.type === 'venue') return `venue:${result.venue.id}`;
  if (result.type === 'place') return `place:${result.place.id}`;
  if (result.type === 'area') return `area:${result.area.id}`;
  return result.world.id;
}

function ResultRow({ result, onPress }: { result: SearchResult; onPress: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();

  let title = '';
  let subtitle = '';
  let icon: React.ReactNode = null;
  if (result.type === 'venue') {
    const { venue } = result;
    title = localized(venue, 'name', language);
    subtitle = `${t(`category.${venue.category}`)} · ${t('search.partner')}`;
    icon = (
      <View style={[styles.badge, styles.badgeVenue]}>
        <Text style={styles.badgeEmoji}>{venue.deal ? PROMOTION_EMOJI[venue.deal.kind] : CATEGORY_EMOJI[venue.category]}</Text>
      </View>
    );
  } else if (result.type === 'place') {
    const { place } = result;
    const kind = placeIcon(place.kind);
    title = placeName(place, language);
    subtitle = t(`placeKind.${kind}`);
    icon = <Image source={PLACE_ICON_IMAGES[kind]} style={styles.placeIcon} contentFit="contain" />;
  } else if (result.type === 'world') {
    const { world } = result;
    title = world.name;
    const kindLabel = world.place ? t(`placeKind.${placeIcon(world.place.kind)}`) : t(`search.world.${world.kind}`);
    subtitle = world.context ? `${kindLabel} · ${world.context}` : kindLabel;
    icon = world.place ? (
      <Image source={PLACE_ICON_IMAGES[placeIcon(world.place.kind)]} style={styles.placeIcon} contentFit="contain" />
    ) : (
      <View style={[styles.badge, styles.badgeWorld]}>
        <Icon name={world.kind === 'street' ? 'road' : 'language'} size={16} color={Colors.white} />
      </View>
    );
  } else {
    const { area } = result;
    title = areaName(area, language);
    subtitle = t(`search.area.${area.kind}`);
    icon = (
      <View style={[styles.badge, styles.badgeArea]}>
        <Icon name={area.kind === 'road' ? 'road' : 'map'} size={16} color={Colors.white} />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {icon}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 46,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
    ...Raised,
  },
  input: { flex: 1, fontSize: 16, color: Colors.text, paddingVertical: Spacing.sm },
  clear: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  clearText: { ...Type.label, color: Colors.textSecondary },
  pressed: { opacity: 0.7 },
  panel: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    maxHeight: 360,
    borderRadius: Radius.lg,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  list: { paddingVertical: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, minHeight: 56 },
  rowPressed: { backgroundColor: Colors.pressed },
  rowBody: { flex: 1 },
  rowTitle: { ...Type.label, fontSize: 15, color: Colors.text },
  rowSubtitle: { ...Type.small, color: Colors.textMuted },
  placeIcon: { width: 30, height: 30 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badgeVenue: { backgroundColor: Colors.orange },
  badgeArea: { backgroundColor: Colors.violet },
  badgeWorld: { backgroundColor: '#3F78E0' },
  badgeEmoji: { fontSize: 15 },
  spinner: { marginVertical: Spacing.md },
  empty: { ...Type.body, color: Colors.textSecondary, padding: Spacing.lg, textAlign: 'center' },
}));
