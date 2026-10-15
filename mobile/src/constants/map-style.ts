import type { MapStyleElement } from 'react-native-maps';

// Dark Google Maps style matching the app's night theme (src/constants/theme.ts). Google's businesses
// (restaurants, cafes, bars, …) stay visible and tappable so people can create a table at any of them; other
// points of interest are hidden. Streets, transit and parks stay for orientation.
export const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#160D24' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#968AAE' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0612' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2F2247' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.business', elementType: 'labels.text.fill', stylers: [{ color: '#B9AECB' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#132018' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A1E40' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0A0612' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4A3870' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#CBC0DE' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2F2247' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#CBC0DE' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B1630' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4A5A80' }] },
];

// Light theme: Google's standard look, with the same rule as the dark style (only businesses and parks).
export const lightMapStyle: MapStyleElement[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];
