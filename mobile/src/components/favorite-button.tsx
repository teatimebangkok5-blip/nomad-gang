import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { RaisedSmall } from '@/constants/theme';
import { useFavorite, type FavoriteTarget } from '@/lib/favorites';
import { makeStyles, useColors } from '@/lib/theme';

// The heart on a place card: saves the place or partner venue to Favorites (on the profile).
export function FavoriteButton({ target, size = 40 }: { target: FavoriteTarget; size?: number }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { saved, toggle } = useFavorite(target);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? t('favorites.remove') : t('favorites.save')}
      accessibilityState={{ selected: saved === true }}
      hitSlop={6}
      disabled={saved === null}
      onPress={toggle}
      style={({ pressed }) => [styles.button, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}>
      <GlossyFill />
      <Icon name={saved ? 'heart' : 'heartOutline'} size={size * 0.5} color={saved ? Colors.pink : Colors.textSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  pressed: { opacity: 0.7 },
}));
