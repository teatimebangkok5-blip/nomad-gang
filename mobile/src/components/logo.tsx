import { Text } from 'react-native';
import { makeStyles } from '@/lib/theme';

// Wordmark as on the app icon: white "Table", orange "M", pink "eet".
export function Logo({ size = 22 }: { size?: number }) {
  const styles = useStyles();
  return (
    <Text accessibilityRole="header" accessibilityLabel="TableMeet" style={[styles.logo, { fontSize: size }]}>
      Table<Text style={styles.m}>M</Text>
      <Text style={styles.eet}>eet</Text>
    </Text>
  );
}

const useStyles = makeStyles((Colors) => ({
  logo: { fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  m: { color: Colors.accent },
  eet: { color: Colors.pink },
}));
