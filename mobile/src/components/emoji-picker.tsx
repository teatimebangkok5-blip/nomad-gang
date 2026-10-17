import { Pressable, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { GROUP_EMOJIS } from '@/lib/messages';
import { makeStyles } from '@/lib/theme';

// The group's emoji: tap one.
export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.grid}>
      {GROUP_EMOJIS.map((emoji) => (
        <Pressable
          key={emoji}
          accessibilityRole="button"
          accessibilityLabel={emoji}
          accessibilityState={{ selected: emoji === value }}
          onPress={() => onChange(emoji)}
          style={({ pressed }) => [styles.cell, emoji === value && styles.cellOn, pressed && styles.pressed]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  cell: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cellOn: { borderColor: Colors.violet, borderWidth: 2, backgroundColor: Colors.violetTint },
  pressed: { opacity: 0.7 },
  emoji: { fontSize: 24 },
}));
