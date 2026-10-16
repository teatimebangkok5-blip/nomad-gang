import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

type SymbolName = Exclude<ComponentProps<typeof SymbolView>['name'], string>;
type AndroidName = NonNullable<SymbolName['android']>;
type IosName = NonNullable<SymbolName['ios']>;

// Material Symbols on Android, SF Symbols on iPhone (for when the iOS version is built).
const ICONS = {
  cafe: { android: 'local_cafe', ios: 'cup.and.saucer.fill' },
  restaurant: { android: 'restaurant', ios: 'fork.knife' },
  rooftop: { android: 'deck', ios: 'building.2.fill' },
  bar: { android: 'local_bar', ios: 'wineglass.fill' },
  attraction: { android: 'attractions', ios: 'star.fill' },
  park: { android: 'park', ios: 'leaf.fill' },
  mall: { android: 'local_mall', ios: 'bag.fill' },
  museum: { android: 'museum', ios: 'building.columns.fill' },
  temple: { android: 'temple_buddhist', ios: 'building.fill' },
  market: { android: 'storefront', ios: 'basket.fill' },
  entertainment: { android: 'local_activity', ios: 'ticket.fill' },
  hangout: { android: 'celebration', ios: 'party.popper.fill' },
  pin: { android: 'pin_drop', ios: 'mappin.and.ellipse' },
  ticket: { android: 'confirmation_number', ios: 'ticket.fill' },
  website: { android: 'open_in_new', ios: 'arrow.up.right.square' },
  search: { android: 'search', ios: 'magnifyingglass' },
  camera: { android: 'photo_camera', ios: 'camera.fill' },
  photo: { android: 'add_photo_alternate', ios: 'photo.badge.plus' },
  road: { android: 'add_road', ios: 'road.lanes' },
  deal: { android: 'sell', ios: 'tag.fill' },
  location: { android: 'location_on', ios: 'location.fill' },
  locationOff: { android: 'location_off', ios: 'location.slash.fill' },
  nearMe: { android: 'near_me', ios: 'location.north.fill' },
  group: { android: 'group', ios: 'person.3.fill' },
  logout: { android: 'logout', ios: 'rectangle.portrait.and.arrow.right' },
  error: { android: 'error', ios: 'exclamationmark.triangle.fill' },
  store: { android: 'storefront', ios: 'storefront.fill' },
  back: { android: 'arrow_back', ios: 'chevron.left' },
  plus: { android: 'add', ios: 'plus' },
  minus: { android: 'remove', ios: 'minus' },
  time: { android: 'schedule', ios: 'clock' },
  person: { android: 'person', ios: 'person.fill' },
  list: { android: 'list', ios: 'list.bullet' },
  map: { android: 'map', ios: 'map' },
  add: { android: 'add', ios: 'plus' },
  settings: { android: 'settings', ios: 'gearshape.fill' },
  darkMode: { android: 'dark_mode', ios: 'moon.fill' },
  lightMode: { android: 'light_mode', ios: 'sun.max.fill' },
  language: { android: 'language', ios: 'globe' },
  check: { android: 'check', ios: 'checkmark' },
  chat: { android: 'chat', ios: 'bubble.left.and.bubble.right.fill' },
  send: { android: 'send', ios: 'paperplane.fill' },
  more: { android: 'more_vert', ios: 'ellipsis' },
  travellers: { android: 'person_pin_circle', ios: 'person.2.wave.2.fill' },
} satisfies Record<string, { android: AndroidName; ios: IosName }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
