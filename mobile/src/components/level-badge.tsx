import { useTranslation } from 'react-i18next';
import { Text, View, type ViewStyle } from 'react-native';

import { ToneFill } from '@/components/glossy';
import { useUserLevel } from '@/lib/levels';
import { makeStyles } from '@/lib/theme';

export type BadgeCorner = 'bottomRight' | 'bottomLeft' | 'topLeft';

// Someone's level as a small brand-gradient circle on the corner of their profile picture. `size` is the picture's
// size; the badge scales with it. Put it as the last child of a view that wraps the picture and doesn't clip
// (no overflow: 'hidden'). Shows nothing until the level is known, or across a block.
export function LevelBadge({
  userId,
  size,
  corner = 'bottomRight',
  level: knownLevel,
}: {
  userId: string | null | undefined;
  size: number;
  corner?: BadgeCorner;
  // Use this level instead of loading it (e.g. a list that already has it).
  level?: number | null;
}) {
  const loaded = useUserLevel(knownLevel === undefined ? userId : null);
  const level = knownLevel === undefined ? loaded : knownLevel;
  if (!level) return null;
  return <LevelBadgeView level={level} size={size} corner={corner} />;
}

export function LevelBadgeView({ level, size, corner = 'bottomRight' }: { level: number; size: number; corner?: BadgeCorner }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const badge = Math.round(Math.min(34, Math.max(16, size * 0.4)));
  // Centred on the circle's edge at 45° (0.146 × size in from the box corner), so it sits on round pictures of any size.
  const offset = Math.round(size * 0.146 - badge / 2);
  const place: ViewStyle =
    corner === 'bottomLeft'
      ? { left: offset, bottom: offset }
      : corner === 'topLeft'
        ? { left: offset, top: offset }
        : { right: offset, bottom: offset };
  const text = level > 99 ? '99+' : String(level);
  return (
    <View
      accessible
      accessibilityLabel={t('levels.badgeLabel', { level })}
      pointerEvents="none"
      style={[
        styles.badge,
        place,
        { minWidth: badge, height: badge, borderRadius: badge / 2, paddingHorizontal: text.length > 1 ? badge * 0.14 : 0 },
      ]}>
      <ToneFill tone="brand" shine={false} />
      <Text style={[styles.text, { fontSize: badge * 0.52, lineHeight: badge * 0.66 }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.bg,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  text: { fontWeight: '800', color: Colors.onBrand, textAlign: 'center', includeFontPadding: false },
}));
