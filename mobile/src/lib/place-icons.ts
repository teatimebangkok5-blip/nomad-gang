import type { ImageRequireSource } from 'react-native';

import type { PlaceIcon } from '@/lib/places';

// Place icon images (assets/images/map-icons, see PLACE_ICON_COLORS in src/lib/places.ts): the map's symbol layer
// and the search results use them.
export const PLACE_ICON_IMAGES: Record<PlaceIcon, ImageRequireSource> = {
  food: require('@/assets/images/map-icons/food.png'),
  fastfood: require('@/assets/images/map-icons/fastfood.png'),
  cafe: require('@/assets/images/map-icons/cafe.png'),
  bakery: require('@/assets/images/map-icons/bakery.png'),
  icecream: require('@/assets/images/map-icons/icecream.png'),
  bar: require('@/assets/images/map-icons/bar.png'),
  pub: require('@/assets/images/map-icons/pub.png'),
  temple: require('@/assets/images/map-icons/temple.png'),
  park: require('@/assets/images/map-icons/park.png'),
  market: require('@/assets/images/map-icons/market.png'),
  mall: require('@/assets/images/map-icons/mall.png'),
  museum: require('@/assets/images/map-icons/museum.png'),
  theatre: require('@/assets/images/map-icons/theatre.png'),
  cinema: require('@/assets/images/map-icons/cinema.png'),
  fun: require('@/assets/images/map-icons/fun.png'),
  zoo: require('@/assets/images/map-icons/zoo.png'),
  attraction: require('@/assets/images/map-icons/attraction.png'),
  monument: require('@/assets/images/map-icons/monument.png'),
  castle: require('@/assets/images/map-icons/castle.png'),
  viewpoint: require('@/assets/images/map-icons/viewpoint.png'),
  place: require('@/assets/images/map-icons/place.png'),
};
