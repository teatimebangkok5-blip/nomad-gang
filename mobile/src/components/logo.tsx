import { Text } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useColors } from '@/lib/theme';

// Wordmark as on the app icon: white "Table", orange "M", pink "eet", in the heading font (also in Thai: it's a name).
export function Logo({ size = 22 }: { size?: number }) {
  const Colors = useColors();
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="TableMeet"
      style={{ fontFamily: Fonts.heading, fontSize: size, fontWeight: '800', letterSpacing: -size * 0.03, color: Colors.text }}>
      Table<Text style={{ color: Colors.orange }}>M</Text>
      <Text style={{ color: Colors.pink }}>eet</Text>
    </Text>
  );
}
