import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  Marker,
  UserLocation,
  VectorSource,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { lightColors, Radius } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import type { Coords } from '@/lib/location';
import { PLACE_ICON_IMAGES } from '@/lib/place-icons';
import {
  fetchPlace,
  ICON_ZOOM,
  PLACE_ICON_COLORS,
  placeIcon,
  placeName,
  WORLD_FAMOUS_LANGUAGES,
  WORLD_FAMOUS_MIN,
  WORLD_SUBCLASS_KIND,
  worldPlaceFromTile,
  type MapBounds,
  type Place,
  type PlaceDot,
} from '@/lib/places';
import { makeStyles, useColors } from '@/lib/theme';
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
// The map is light in both app themes, so what we draw on it uses light-map colors: white halos and rings, and the
// Light theme's accent / violet for pin names.
const MAP_HALO = '#FFFFFF';
const MAP_LAND = '#F8F4F0';

// The world places layer (Hangout map) reads OpenFreeMap's vector tiles directly: OpenStreetMap's "poi" layer,
// filtered to places to hang out. Bangkok is left out there: its places come from the database (public.places).
const WORLD_TILES = 'https://tiles.openfreemap.org/planet';
const BANGKOK_BOX = {
  type: 'Polygon',
  coordinates: [[[100.25, 13.45], [100.95, 13.45], [100.95, 14.1], [100.25, 14.1], [100.25, 13.45]]],
};
const WORLD_SUBCLASSES = Object.keys(WORLD_SUBCLASS_KIND);
const WORLD_FILTER = [
  'all',
  ['has', 'name'],
  [
    'any',
    ['match', ['get', 'subclass'], WORLD_SUBCLASSES, true, false],
    [
      'all',
      ['==', ['get', 'class'], 'place_of_worship'],
      ['>=', ['+', ...WORLD_FAMOUS_LANGUAGES.map((lang) => ['case', ['has', `name:${lang}`], 1, 0])], WORLD_FAMOUS_MIN],
    ],
  ],
  ['!', ['within', BANGKOK_BOX]],
];
// Tile subclass → the app's icon (as in PLACE_ICON_COLORS); religious places use the temple icon.
function worldMatch(value: (kind: string) => string, fallback: string) {
  return [
    'match',
    ['get', 'subclass'],
    ...Object.entries(WORLD_SUBCLASS_KIND).flatMap(([subclass, kind]) => [subclass, value(kind)]),
    fallback,
  ];
}

// Free map: MapLibre with OpenFreeMap tiles (OpenStreetMap data). No API key, no billing.
// "Liberty" is the colorful style (blue water, green parks, yellow main roads), used in both app themes.
// The style includes the required "© OpenStreetMap" credit, shown via the map's attribution button.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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
  placeDots = [],
  dotsMinZoom = 12,
  worldPlaces = false,
  onMapPress,
  onBoundsChange,
  userCoords,
  height,
  fullScreen = false,
  mapPadding,
  focus,
  route,
  routeStops,
  initialZoom = 13,
  center,
  interactive = true,
}: {
  pins: MapPin[];
  onPinPress: (key: string) => void;
  // Bangkok places (OpenStreetMap) drawn as colored icons with their names; tapping one calls onPlacePress.
  places?: Place[];
  onPlacePress?: (place: Place) => void;
  // Every place as a small dot in its icon color, shown from `dotsMinZoom` until the icons take over (ICON_ZOOM).
  placeDots?: PlaceDot[];
  dotsMinZoom?: number;
  // Hangout map: also draw world places from the map tiles (outside Bangkok); tapping one calls onPlacePress with a
  // Place that has `world: true`.
  worldPlaces?: boolean;
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
  // A line through these points, in order (a day plan's route). The map zooms to fit it when it appears or changes.
  route?: { lat: number; lng: number }[];
  // Small numbered circles on the route (its stops), drawn by the map so they don't cover pins.
  routeStops?: { lat: number; lng: number; label: string }[];
  // Starting zoom.
  initialZoom?: number;
  // Start here instead of the user (e.g. the table screen's small map of its place).
  center?: Coords | null;
  // false: a picture of the map that doesn't pan or zoom (inside a scrolling screen).
  interactive?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  // Re-renders the labels when the language changes.
  useTranslation();
  const language = useLanguage();
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);

  // The visible area right after the map loads (the map may not move by itself, e.g. without the phone's
  // location), so the places in view show straight away.
  async function reportInitialBounds() {
    const map = mapRef.current;
    if (!map || !onBoundsChange) return;
    const [bounds, zoom] = await Promise.all([map.getBounds(), map.getZoom()]);
    onBoundsChange({ west: bounds[0], south: bounds[1], east: bounds[2], north: bounds[3], zoom });
  }
  const centeredOnUser = useRef(false);
  // A tap on a pin can also reach the map; ignore map taps right after a pin tap.
  const lastPinPress = useRef(0);

  // Move to the user once their location arrives (only the first time, so we don't fight their panning). The
  // camera ignores moves before the map has loaded, so a location that arrives earlier waits for the load.
  const mapLoaded = useRef(false);
  function centerOnUser() {
    if (!userCoords || center || centeredOnUser.current || !mapLoaded.current) return;
    centeredOnUser.current = true;
    cameraRef.current?.easeTo({ center: [userCoords.lng, userCoords.lat], zoom: 15, duration: 600 });
  }
  useEffect(centerOnUser);

  // Fit the route in view when it changes (the first one is framed by the initial camera).
  const routeBounds = boundsOf(route);
  const routeKey = routeBounds?.join(',') ?? '';
  const fittedRoute = useRef(routeKey);
  useEffect(() => {
    if (routeKey === fittedRoute.current) return;
    fittedRoute.current = routeKey;
    const bounds = routeKey ? (routeKey.split(',').map(Number) as [number, number, number, number]) : null;
    if (!bounds) return;
    centeredOnUser.current = true;
    cameraRef.current?.fitBounds(bounds, { padding: routePadding(mapPadding), duration: 700 });
  }, [routeKey, mapPadding]);

  // Compared by value, so a focus rebuilt on every render (e.g. from a screen's params) moves the camera only once.
  const focusKey = focus ? [focus.lng, focus.lat, focus.zoom, focus.seq].join(',') : '';
  useEffect(() => {
    if (!focusKey) return;
    const [lng, lat, zoom] = focusKey.split(',').map(Number);
    centeredOnUser.current = true; // don't jump back to the user afterwards
    cameraRef.current?.easeTo({ center: [lng, lat], zoom, duration: 700 });
  }, [focusKey]);

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
        color: PLACE_ICON_COLORS[placeIcon(place.kind)],
      },
    })),
  };

  // Zoomed-out dots (no names; a tapped dot loads its place).
  const dotsGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: placeDots.map((dot) => ({
      type: 'Feature',
      id: dot.id,
      geometry: { type: 'Point', coordinates: [dot.lng, dot.lat] },
      properties: { id: dot.id, color: PLACE_ICON_COLORS[placeIcon(dot.kind)] },
    })),
  };

  async function handleDotPress(id: string) {
    const place = places.find((p) => p.id === id) ?? (await fetchPlace(id));
    if (place) onPlacePress?.(place);
  }

  // Names beside the pins (partner venues), drawn by the map under the pin views.
  const pinLabelsGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: pins
      .filter((pin) => pin.label)
      .map((pin) => ({
        type: 'Feature',
        id: pin.key,
        geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
        properties: { name: pin.label, color: pin.tone === 'violet' ? lightColors.violet : lightColors.accent },
      })),
  };

  // World places: icon color by kind, and the name in the app's language when OpenStreetMap has it (Thai falls back
  // to English, which reads better than an unfamiliar script).
  const worldColor = worldMatch((kind) => PLACE_ICON_COLORS[placeIcon(kind)], PLACE_ICON_COLORS.temple) as never;
  const worldName =
    language === 'th'
      ? ['coalesce', ['get', 'name:th'], ['get', 'name:en'], ['get', 'name']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name']];
  // Small dot with a thin ring, a little bigger as the map zooms in.
  const dotStyle = (color: unknown) => ({
    circleColor: color as never,
    circleRadius: ['interpolate', ['linear'], ['zoom'], 10, 2.5, ICON_ZOOM, 5] as never,
    circleStrokeColor: MAP_HALO,
    circleStrokeWidth: 1,
  });

  // A route opens on its first point; otherwise the given center, the user, else central Bangkok.
  const start = route?.[0] ?? center ?? userCoords ?? BANGKOK;
  const frameStyle = fullScreen ? StyleSheet.absoluteFill : [styles.frame, { height }];

  return (
    <View style={[frameStyle, styles.mapBackground]}>
      <Map
        ref={mapRef}
        onDidFinishLoadingMap={() => {
          mapLoaded.current = true;
          centerOnUser();
          reportInitialBounds().catch(() => {});
        }}
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        contentInset={mapPadding}
        logo={false}
        attribution
        attributionPosition={{ bottom: (mapPadding?.bottom ?? 0) + 8, right: 8 }}
        compass={false}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
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
        <Camera
          ref={cameraRef}
          initialViewState={
            routeBounds
              ? { bounds: routeBounds, padding: routePadding(mapPadding) }
              : { center: [start.lng, start.lat], zoom: initialZoom }
          }
        />
        {userCoords && <UserLocation />}
        <Images images={MAP_IMAGES} />

        {route && route.length > 1 && (
          <GeoJSONSource
            id="route"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: route.map((point) => [point.lng, point.lat]) },
            }}>
            <Layer
              id="route-line"
              type="line"
              style={{ lineColor: Colors.violet, lineWidth: 4, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round', lineDasharray: [1.5, 1] }}
            />
          </GeoJSONSource>
        )}

        {routeStops && routeStops.length > 0 && (
          <GeoJSONSource
            id="route-stops"
            data={{
              type: 'FeatureCollection',
              features: routeStops.map((stop, index) => ({
                type: 'Feature',
                id: index,
                geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
                properties: { label: stop.label },
              })),
            }}>
            <Layer
              id="route-stops-circle"
              type="circle"
              style={{ circleRadius: 11, circleColor: Colors.violet, circleStrokeColor: Colors.white, circleStrokeWidth: 2 }}
            />
            <Layer
              id="route-stops-label"
              type="symbol"
              style={{
                textField: ['get', 'label'],
                textFont: LABEL_FONT,
                textSize: 12,
                textColor: Colors.white,
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
          </GeoJSONSource>
        )}

        {placeDots.length > 0 && (
          <GeoJSONSource
            id="place-dots"
            data={dotsGeoJson}
            onPress={(event) => {
              event.stopPropagation();
              const id = event.nativeEvent.features[0]?.properties?.id;
              if (typeof id === 'string') handleDotPress(id).catch(() => {});
            }}>
            <Layer id="place-dots-circle" type="circle" minzoom={dotsMinZoom} maxzoom={ICON_ZOOM} style={dotStyle(['get', 'color'])} />
          </GeoJSONSource>
        )}

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
              minzoom={ICON_ZOOM}
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
                textHaloColor: MAP_HALO,
                textHaloWidth: 1.5,
              }}
            />
          </GeoJSONSource>
        )}

        {worldPlaces && (
          <VectorSource
            id="world-places"
            url={WORLD_TILES}
            onPress={(event) => {
              event.stopPropagation();
              const feature = event.nativeEvent.features[0];
              const place = feature ? worldPlaceFromTile(feature) : null;
              if (place) onPlacePress?.(place);
            }}>
            <Layer
              id="world-places-dots"
              type="circle"
              source-layer="poi"
              maxzoom={ICON_ZOOM}
              filter={WORLD_FILTER as never}
              style={dotStyle(worldColor)}
            />
            <Layer
              id="world-places-icons"
              type="symbol"
              source-layer="poi"
              minzoom={ICON_ZOOM}
              filter={WORLD_FILTER as never}
              style={{
                iconImage: worldMatch((kind) => `tm-${placeIcon(kind)}`, 'tm-temple') as never,
                iconSize: PLACE_ICON_SIZE,
                iconPadding: [1],
                // Better-known places win when icons would overlap.
                symbolSortKey: ['get', 'rank'],
                textField: worldName as never,
                textFont: LABEL_FONT,
                textSize: 12,
                textAnchor: 'left',
                textJustify: 'left',
                textOffset: [1.6, -0.1],
                textMaxWidth: 9,
                textOptional: true,
                textColor: worldColor,
                textHaloColor: MAP_HALO,
                textHaloWidth: 1.5,
              }}
            />
          </VectorSource>
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
                textHaloColor: MAP_HALO,
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

// [west, south, east, north] around the route, or null without one.
function boundsOf(route: { lat: number; lng: number }[] | undefined): [number, number, number, number] | null {
  if (!route || route.length < 2) return null;
  const lats = route.map((point) => point.lat);
  const lngs = route.map((point) => point.lng);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

// Room around a fitted route: the floating UI plus a margin for the pins.
function routePadding(mapPadding: { top: number; right: number; bottom: number; left: number } | undefined) {
  const p = mapPadding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: p.top + 60, right: p.right + 40, bottom: p.bottom + 30, left: p.left + 40 };
}

// 3D pin: glossy gradient ball (light top -> deep bottom) with a white rim, a shine, the tail, and a soft shadow on
// the ground. Orange → pink for tables and partner venues, violet for hangouts / travellers. A selected pin is bigger.
const PIN_GRADIENTS = {
  orange: ['#FFB547', '#FE593B', '#FF1F78'],
  violet: ['#B79DFF', '#7B4DFF', '#4B22C9'],
} as const;

function PinView({ pin }: { pin: MapPin }) {
  const styles = useStyles();
  const tone = pin.tone === 'violet' ? 'violet' : 'orange';
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
  // Shown until the tiles load; the map's land color, so Dark theme doesn't flash black first.
  mapBackground: { backgroundColor: MAP_LAND },
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
  pinSelected: { transform: [{ scale: 1.2 }] },
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
    backgroundColor: '#0A0612',
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 9,
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: Colors.white },
}));
