import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { usePlus } from '@/lib/plus';
import { makeStyles, useColors } from '@/lib/theme';

// Wraps a Plus-only screen (Plan my day, Hidden Gems, Passport): people without Plus go to the Plus page instead.
export function RequirePlus({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const Colors = useColors();
  const plus = usePlus();
  if (plus.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (!plus.unlocked) return <Redirect href="/plus" />;
  return children;
}

const useStyles = makeStyles((Colors) => ({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
}));
