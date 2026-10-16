import { Pressable, Text } from 'react-native';

import { GlossyFill, Shine } from '@/components/glossy';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { makeStyles } from '@/lib/theme';

// A selectable pill (day and time pickers). Selected = orange with dark text, like the category filter.
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && !selected && styles.pressed]}>
      {selected ? <Shine onColor /> : <GlossyFill />}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  chip: {
    minHeight: 40,
    minWidth: 64,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...RaisedSmall,
  },
  selected: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  pressed: { backgroundColor: Colors.surfaceRaised },
  label: { ...Type.label, color: Colors.textSecondary },
  labelSelected: { color: Colors.onBrand, fontWeight: '800' },
}));
