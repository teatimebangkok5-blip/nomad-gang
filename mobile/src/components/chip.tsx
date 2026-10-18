import { Pressable, Text } from 'react-native';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { Radius, RaisedSmall, Spacing, ToneShadow, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// A selectable pill (filters, days, times, cost). Selected = orange with dark text, or violet with white text on
// hangout screens (`tone="violet"`). `shape="tile"`: a rounded square for the time-slot grid.
export function Chip({
  label,
  selected,
  onPress,
  tone = 'orange',
  icon,
  shape = 'pill',
  tall = false,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: 'orange' | 'violet';
  icon?: IconName;
  shape?: 'pill' | 'tile';
  // 44 dp instead of 40 (day pickers).
  tall?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const violet = tone === 'violet';
  const textColor = selected ? (violet ? Colors.white : Colors.onBrand) : Colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        shape === 'tile' && styles.tile,
        tall && styles.tall,
        icon && styles.withIcon,
        selected ? (violet ? ToneShadow.violet : ToneShadow.orange) : shape === 'pill' && RaisedSmall,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !selected && styles.pressed,
      ]}>
      {selected ? <ToneFill tone={violet ? 'violet' : 'orange'} /> : <GlossyFill />}
      {icon && <Icon name={icon} size={18} color={textColor} />}
      <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  chip: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    minWidth: 56,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tile: { minHeight: 44, borderRadius: 14, paddingHorizontal: Spacing.sm },
  tall: { minHeight: 44 },
  withIcon: { paddingLeft: Spacing.md - 2, paddingRight: Spacing.md + 2 },
  selected: { borderColor: 'transparent' },
  disabled: { opacity: 0.35 },
  pressed: { backgroundColor: Colors.surfaceRaised },
  label: { ...Type.label },
}));
