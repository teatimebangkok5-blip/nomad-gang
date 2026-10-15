import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { Icon } from '@/components/icon';
import { darkMapStyle } from '@/constants/map-style';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import type { Coords } from '@/lib/location';
import type { VenueCategory } from '@/lib/venues';

export type MapPin = {
  key: string;
  lat: number;
  lng: number;
  category: VenueCategory;
  // Shown as a badge, e.g. the number of open tables at the venue.
  count?: number;
  selected?: boolean;
};

// Emoji render reliably inside map markers (native icon views can come out blank in the marker snapshot).
const CATEGORY_EMOJI: Record<VenueCategory, string> = {
  cafe: '☕',
  restaurant: '🍽️',
  rooftop: '🌆',
  bar: '🍸',
};

// Siam / central Bangkok, used until the phone's location is known.
const BANGKOK: Coords = { lat: 13.7466, lng: 100.5393 };
const DELTA = 0.06;

// False when the build has no Google Maps key (see app.config.ts); Google Maps would crash without one.
const mapsEnabled = Constants.expoConfig?.extra?.mapsEnabled === true;

export function VenueMap({
  pins,
  onPinPress,
  userCoords,
  height,
}: {
  pins: MapPin[];
  onPinPress: (key: string) => void;
  userCoords: Coords | null;
  height: number;
}) {
  const { t } = useTranslation();
  const mapRef = useRef<MapView>(null);
  const centeredOnUser = useRef(false);

  // Move to the user once their location arrives (only the first time, so we don't fight their panning).
  useEffect(() => {
    if (!userCoords || centeredOnUser.current) return;
    centeredOnUser.current = true;
    mapRef.current?.animateToRegion(
      { latitude: userCoords.lat, longitude: userCoords.lng, latitudeDelta: DELTA, longitudeDelta: DELTA },
      500,
    );
  }, [userCoords]);

  if (!mapsEnabled) {
    return (
      <View style={[styles.frame, styles.placeholder, { height }]}>
        <Icon name="location" size={28} color={Colors.textMuted} />
        <Text style={styles.placeholderText}>{t('tables.mapUnavailable')}</Text>
      </View>
    );
  }

  const start = userCoords ?? BANGKOK;
  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={darkMapStyle}
        initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        showsUserLocation={Boolean(userCoords)}
        showsMyLocationButton={Boolean(userCoords)}
        toolbarEnabled={false}>
        {pins.map((pin) => (
          // The key includes what the pin shows, so a changed pin remounts and re-renders its snapshot.
          <PinMarker key={`${pin.key}-${pin.count ?? 0}-${pin.selected ? 1 : 0}`} pin={pin} onPress={onPinPress} />
        ))}
      </MapView>
    </View>
  );
}

function PinMarker({ pin, onPress }: { pin: MapPin; onPress: (key: string) => void }) {
  // Android draws custom markers as a snapshot; keep tracking briefly so the first render is captured, then stop
  // (tracking forever costs performance).
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracks(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={{ latitude: pin.lat, longitude: pin.lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracks}
      onPress={() => onPress(pin.key)}>
      <View style={styles.pinWrap}>
        <View style={[styles.pin, pin.selected && styles.pinSelected]}>
          <Text style={styles.emoji}>{CATEGORY_EMOJI[pin.category]}</Text>
        </View>
        <View style={[styles.tail, pin.selected && styles.tailSelected]} />
        {pin.count ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pin.count}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

const PIN = 40;

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  placeholderText: { ...Type.small, color: Colors.textMuted },
  pinWrap: { alignItems: 'center', paddingTop: 6, paddingRight: 8 },
  pin: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    backgroundColor: Colors.orange,
    borderWidth: 2,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSelected: { backgroundColor: Colors.pink, transform: [{ scale: 1.15 }] },
  emoji: { fontSize: 20 },
  tail: {
    width: 10,
    height: 10,
    marginTop: -6,
    backgroundColor: Colors.orange,
    transform: [{ rotate: '45deg' }],
  },
  tailSelected: { backgroundColor: Colors.pink },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.pink,
    borderWidth: 2,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 13, fontWeight: '800', color: Colors.onBrand },
});
