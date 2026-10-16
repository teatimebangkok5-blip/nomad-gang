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

// The icon files are 96 px, which the map treats as 96 dp; this shows them at about 27 dp.
const PLACE_ICON_SIZE = 0.28;
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
                textOffset: [1.25, 0],
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
                // Right of the pin's circle, which sits about 30 dp above the point.
                textOffset: [1.6, -2.3],
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
