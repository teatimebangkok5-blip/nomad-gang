import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  Marker,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { currentLanguage } from '@/i18n';
import type { Coords } from '@/lib/location';
import { PLACE_ICON_IMAGES } from '@/lib/place-icons';
import { PLACE_ICON_COLORS, placeIcon, placeName, type MapBounds, type Place } from '@/lib/places';
import { makeStyles, useColors, useTheme } from '@/lib/theme';
import type { VenueCategory } from '@/lib/venues';

// Prefixed so they can't clash with the map style's own images.
const MAP_IMAGES = Object.fromEntries(
  Object.entries(PLACE_ICON_IMAGES).map(([key, source]) => [`tm-${key}`, source]),
);

// The icon files are 120 px (a 100 px ball plus its shadow), which the map treats as 120 dp; this shows the ball at
// about 32 dp.
const PLACE_ICON_SIZE = 0.32;
// The label font must be one the map style's font server has (OpenFreeMap: Noto Sans, with Thai).
const LABEL_FONT = ['Noto Sans Bold'];

// Lighter label colors on the dark map so they stay readable.
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (255 - c) * amount);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

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
  // Name shown beside the pin (e.g. the partner venue's name).
  label?: string;
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

export type MapFocus = { lat: number; lng: number; zoom: number; seq: number };

// Siam / central Bangkok, used until the phone's location is known.
const BANGKOK: Coords = { lat: 13.7466, lng: 100.5393 };

export function VenueMap({
  pins,
  onPinPress,
  places = [],
  onPlacePress,
  onMapPress,
  onBoundsChange,
  userCoords,
  height,
  fullScreen = false,
  mapPadding,
  focus,
}: {
  pins: MapPin[];
  onPinPress: (key: string) => void;
  // Bangkok places (OpenStreetMap) drawn as colored icons with their names; tapping one calls onPlacePress.
  places?: Place[];
  onPlacePress?: (place: Place) => void;
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
  // Move the camera here (e.g. a search result). Bump `seq` to move again to the same spot.
  focus?: MapFocus | null;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { name: themeName } = useTheme();
  // Re-renders the labels when the language changes.
  useTranslation();
  const language = currentLanguage();
  const labelColor = (hex: string) => (themeName === 'dark' ? lighten(hex, 0.3) : hex);
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

  useEffect(() => {
    if (!focus) return;
    centeredOnUser.current = true; // don't jump back to the user afterwards
    cameraRef.current?.easeTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 700 });
  }, [focus]);

  const placesGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      id: place.id,
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        icon: `tm-${placeIcon(place.kind)}`,
        name: placeName(place, language),
        color: labelColor(PLACE_ICON_COLORS[placeIcon(place.kind)]),
      },
    })),
  };

  // Names beside the pins (partner venues), drawn by the map under the pin views.
  const pinLabelsGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: pins
      .filter((pin) => pin.label)
      .map((pin) => ({
        type: 'Feature',
        id: pin.key,
        geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
        properties: { name: pin.label, color: pin.tone === 'violet' ? labelColor(Colors.violet) : Colors.accent },
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
        <Images images={MAP_IMAGES} />

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
            {/* Icons that would overlap are hidden until the map is zoomed in; names hide first. */}
            <Layer
              id="places-icons"
              type="symbol"
              style={{
                iconImage: ['get', 'icon'],
                iconSize: PLACE_ICON_SIZE,
                iconPadding: [1],
                textField: ['get', 'name'],
                textFont: LABEL_FONT,
                textSize: 12,
                textAnchor: 'left',
                textJustify: 'left',
                textOffset: [1.6, -0.1],
                textMaxWidth: 9,
                textOptional: true,
                textColor: ['get', 'color'],
                textHaloColor: Colors.bg,
                textHaloWidth: 1.5,
              }}
            />
          </GeoJSONSource>
        )}

        {pinLabelsGeoJson.features.length > 0 && (
          <GeoJSONSource id="pin-labels" data={pinLabelsGeoJson}>
            <Layer
              id="pin-labels-text"
              type="symbol"
              style={{
                textField: ['get', 'name'],
                textFont: LABEL_FONT,
                textSize: 13,
                textAnchor: 'left',
                textJustify: 'left',
                // Right of the pin's ball, which sits about 38 dp above the point.
                textOffset: [2.2, -2.9],
                textMaxWidth: 9,
                textColor: ['get', 'color'],
                textHaloColor: Colors.bg,
                textHaloWidth: 1.5,
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

// 3D pin: glossy gradient ball (light top -> deep bottom) with a white rim, a shine, the tail, and a soft shadow on
// the ground. Orange for partner venues, violet for tables / hangouts / travellers, pink when selected.
const PIN_GRADIENTS = {
  orange: ['#FFC266', '#FF9A1B', '#D96A00'],
  violet: ['#A88BFF', '#7B4DFF', '#4F25C9'],
  pink: ['#FF7AAE', '#FF1F78', '#C4004F'],
} as const;

function PinView({ pin }: { pin: MapPin }) {
  const styles = useStyles();
  const tone = pin.selected ? 'pink' : pin.tone === 'violet' ? 'violet' : 'orange';
  const gradient = PIN_GRADIENTS[tone];
  return (
    <View style={styles.pinWrap}>
      <View style={[styles.pinBody, pin.selected && styles.pinSelected]}>
        <View style={styles.pin}>
          <LinearGradient colors={gradient} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* Shine across the top. */}
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.shine}
          />
          <Text style={styles.emoji}>{pin.emoji}</Text>
        </View>
        <View style={[styles.tail, { backgroundColor: gradient[2] }]} />
      </View>
      <View style={styles.groundShadow} />
      {pin.count ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pin.count}</Text>
        </View>
      ) : null}
    </View>
  );
}

const PIN = 50;

const useStyles = makeStyles((Colors) => ({
  frame: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  mapBackground: { backgroundColor: Colors.surface },
  pinWrap: { alignItems: 'center', paddingTop: 6, paddingRight: 10, paddingLeft: 2 },
  pinBody: { alignItems: 'center' },
  pin: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: Colors.orange,
    // Raised off the map.
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
  },
  pinSelected: { transform: [{ scale: 1.15 }] },
  shine: { position: 'absolute', top: 2, left: 7, right: 7, height: PIN * 0.42, borderRadius: PIN },
  emoji: { fontSize: 25, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3 },
  tail: {
    width: 14,
    height: 14,
    marginTop: -9,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: Colors.white,
    transform: [{ rotate: '45deg' }],
    elevation: 7,
  },
  groundShadow: {
    width: 22,
    height: 7,
    marginTop: -2,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: Colors.pink,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 9,
  },
  badgeText: { fontSize: 12, lineHeight: 14, fontWeight: '800', color: Colors.white },
}));
