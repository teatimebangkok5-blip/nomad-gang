import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { Fonts, Radius, Raised, ToneShadow } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// Round glossy button for headers and map overlays (back, close, list, bell, settings…). `tone` fills it with a
// brand gradient (violet: Travellers; plan: Plan my day). `badge`: a pink count; `star`: the ⭐ corner badge.
// Badges sit outside the circle, which clips its contents.
export function RoundButton({
  icon,
  label,
  onPress,
  size = 44,
  tone,
  badge,
  star = false,
  disabled = false,
  iconColor,
  children,
}: {
  icon?: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  tone?: 'violet' | 'plan';
  badge?: number;
  star?: boolean;
  disabled?: boolean;
  iconColor?: string;
  // Instead of an icon (a language code, a photo).
  children?: ReactNode;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const color = iconColor ?? (tone === 'violet' ? Colors.white : tone === 'plan' ? Colors.onBrand : Colors.text);
  return (
    <View style={{ width: size, height: size }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={4}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          tone ? ToneShadow[tone] : Raised,
          !tone && styles.plain,
          pressed && styles.pressed,
        ]}>
        {tone ? <ToneFill tone={tone} /> : <GlossyFill />}
        {children ?? (icon && <Icon name={icon} size={Math.round(size * 0.5)} color={color} />)}
      </Pressable>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
      {star && (
        <View style={styles.star} pointerEvents="none">
          <Text style={styles.starText}>⭐</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  button: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: Colors.surface },
  plain: { borderWidth: 1, borderColor: Colors.border },
  pressed: { opacity: 0.75 },
  badge: {
    position: 'absolute',
    // Above the button's shadow layer on Android.
    elevation: 10,
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.pink,
    borderWidth: 2,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: Fonts.body, fontSize: 11, lineHeight: 13, fontWeight: '800', color: Colors.onBrand },
  star: {
    ...Raised,
    position: 'absolute',
    elevation: 12,
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: Radius.pill,
    backgroundColor: '#F6F1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starText: { fontSize: 10, lineHeight: 12 },
}));
