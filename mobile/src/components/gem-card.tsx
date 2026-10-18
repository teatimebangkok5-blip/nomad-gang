import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { GEM_CATEGORY_EMOJI, gemPhoto, type Gem } from '@/lib/gems';
import { makeStyles } from '@/lib/theme';

// A Hidden Gem in a list or on the map: photo, name, area · category · price, the local tip.
export function GemCard({ gem, onPress }: { gem: Gem; onPress: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const photo = gemPhoto(gem);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <GlossyFill />
      <View style={styles.thumb}>
        {photo ? (
          <Image source={photo.uri} style={styles.thumbImage} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <Text style={styles.thumbEmoji}>{GEM_CATEGORY_EMOJI[gem.category]}</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {gem.visited ? '✅ ' : ''}
          {localized(gem, 'name', language)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {localized(gem, 'area', language)} · {GEM_CATEGORY_EMOJI[gem.category]} {t(`gems.categories.${gem.category}`)} ·{' '}
          {gem.min_spend === 0 ? t('gems.free') : t('gems.from', { price: gem.min_spend })}
        </Text>
        {gem.local_pick && <Text style={styles.local}>{t('gems.localPick')}</Text>}
        <Text style={styles.tip} numberOfLines={2}>
          💡 {localized(gem, 'tip', language)}
        </Text>
      </View>
      {gem.saved && <Text style={styles.saved}>♥</Text>}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  pressed: { opacity: 0.8 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: Colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 30 },
  body: { flex: 1, gap: 2 },
  name: { ...Type.heading, color: Colors.text },
  meta: { ...Type.small, color: Colors.textSecondary },
  local: { ...Type.small, fontSize: 11, fontWeight: '800', color: Colors.accent },
  tip: { ...Type.small, color: Colors.textMuted },
  saved: { fontSize: 18, color: Colors.pink },
}));
