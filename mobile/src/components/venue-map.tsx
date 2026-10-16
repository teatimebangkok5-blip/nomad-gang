import { Camera, GeoJSONSource, Layer, Map, Marker, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import type { Coords } from '@/lib/location';
import { type MapBounds, type Place } from '@/lib/places';
import { makeStyles, useColors, useTheme } from '@/lib/theme';
import type { VenueCategory } from '@/lib/venues';

// Free map: MapLibre with OpenFreeMap tiles (OpenStreetMap data). No API key, no billing.
// The style includes the required "© OpenStreetMap" credit, shown via the map's attribution button.
const MAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
} as const;

export type MapPin = {
  key: string;
  lat: number;
  lng: number;
  emoji: string;
  // Violet for tables at places and travellers; orange (default) for partner venues.
  tone?: 'orange' | 'violet';
  // Shown as a badge, e.g. the number of open tables at the venue.
  count?: number;
  selected?: boolean;
};

export const CATEGORY_EMOJI: Record<VenueCategory, string> = {
  cafe: '☕',
  restaurant: '🍽️',
  rooftop: '🌆',
  bar: '🍸',
  attraction: '⭐',
  park: '🌳',
  mall: '🏬',
  museum: '🏛️',
  temple: '🛕',
  market: '🛍️',
  entertainment: '🎳',
};

// Siam / central Bangkok, used until the phone's location is known.
const BANGKOK: Coords = { lat: 13.7466, lng: 100.5393 };

export function VenueMap({
  pins,
  onPinPress,
  places = [],
  onPlacePress,
  placeTone = 'orange',
  onMapPress,
  onBoundsChange,
  userCoords,
  height,
  fullScreen = false,
  mapPadding,
}: {
  pins: MapPin[];
  onPinPress: (key: string) => void;
  // Bangkok places (OpenStreetMap) drawn as small dots; tapping one calls onPlacePress.
  places?: Place[];
  onPlacePress?: (place: Place) => void;
  // Dot color: orange for food places, violet for hangout places.
  placeTone?: 'orange' | 'violet';
  // Tap on the map itself (not on a pin or a dot), e.g. to drop a pin anywhere.
  onMapPress?: (coords: Coords) => void;
  // Called when the visible area changes (used to load the places in view).
  onBoundsChange?: (bounds: MapBounds) => void;
  userCoords: Coords | null;
  // Fixed height for an inline map; ignored when fullScreen.
  height?: number;
  // Fill the parent edge to edge (home screen), without the rounded frame.
  fullScreen?: boolean;
  // Space covered by floating UI, so centering and the attribution stay visible.
  mapPadding?: { top: number; right: number; bottom: number; left: number };
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { name: themeName } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const centeredOnUser = useRef(false);
  // A tap on a pin can also reach the map; ignore map taps right after a pin tap.
  const lastPinPress = useRef(0);

  // Move to the user once their location arrives (only the first time, so we don't fight their panning).
  useEffect(() => {
    if (!userCoords || centeredOnUser.current) return;
    centeredOnUser.current = true;
    cameraRef.current?.easeTo({ center: [userCoords.lng, userCoords.lat], zoom: 15, duration: 600 });
  }, [userCoords]);

  const placesGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      id: place.id,
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: { id: place.id },
    })),
  };

  const start = userCoords ?? BANGKOK;
  const frameStyle = fullScreen ? StyleSheet.absoluteFill : [styles.frame, { height }];

  return (
    <View style={[frameStyle, styles.mapBackground]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLES[themeName]}
        contentInset={mapPadding}
        logo={false}
        attribution
        attributionPosition={{ bottom: (mapPadding?.bottom ?? 0) + 8, right: 8 }}
        compass={false}
        touchRotate={false}
        touchPitch={false}
        onRegionDidChange={(event) => {
          const { bounds, zoom } = event.nativeEvent;
          onBoundsChange?.({ west: bounds[0], south: bounds[1], east: bounds[2], north: bounds[3], zoom });
        }}
        onPress={
          onMapPress
            ? (event) => {
                const { nativeEvent } = event;
                if ('features' in nativeEvent && nativeEvent.features.length > 0) return;
                if (Date.now() - lastPinPress.current < 500) return;
                onMapPress({ lng: nativeEvent.lngLat[0], lat: nativeEvent.lngLat[1] });
              }
            : undefined
        }>
        <Camera ref={cameraRef} initialViewState={{ center: [start.lng, start.lat], zoom: 13 }} />
        {userCoords && <UserLocation />}

        {places.length > 0 && (
          <GeoJSONSource
            id="places"
            data={placesGeoJson}
            onPress={(event) => {
              event.stopPropagation();
              const id = event.nativeEvent.features[0]?.properties?.id;
              const place = places.find((p) => p.id === id);
              if (place) onPlacePress?.(place);
            }}>
            <Layer
              id="places-dots"
              type="circle"
              style={{
                circleRadius: 6,
                circleColor: placeTone === 'violet' ? Colors.violet : Colors.orange,
                circleOpacity: 0.9,
                circleStrokeWidth: 2,
                circleStrokeColor: Colors.bg,
              }}
            />
          </GeoJSONSource>
        )}

        {pins.map((pin) => (
          <Marker key={pin.key} id={pin.key} lngLat={[pin.lng, pin.lat]} anchor="bottom" onPress={() => {
              lastPinPress.current = Date.now();
              onPinPress(pin.key);
            }}>
            <PinView pin={pin} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

function PinView({ pin }: { pin: MapPin }) {
  const styles = useStyles();
  return (
    <View style={styles.pinWrap}>
      <View style={[styles.pin, pin.tone === 'violet' && styles.pinViolet, pin.selected && styles.pinSelected]}>
        <Text style={styles.emoji}>{pin.emoji}</Text>
      </View>
      <View style={[styles.tail, pin.tone === 'violet' && styles.pinViolet, pin.selected && styles.tailSelected]} />
      {pin.count ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pin.count}</Text>
        </View>
      ) : null}
    </View>
  );
}

const PIN = 40;

const useStyles = makeStyles((Colors) => ({
  frame: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  mapBackground: { backgroundColor: Colors.surface },
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
  pinViolet: { backgroundColor: Colors.violet },
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
}));
