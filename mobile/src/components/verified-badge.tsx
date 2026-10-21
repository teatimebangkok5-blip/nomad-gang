import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';
import { useUserBadges } from '@/lib/verification';

// The Verified shield next to a name (approved selfie + ID check), and with `withHost` the "Trusted host" tag (3+
// good meetups hosted). Nothing until the badges load or when the person has none.
export function VerifiedBadge({ userId, size = 16, withHost = false }: { userId: string; size?: number; withHost?: boolean }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const badges = useUserBadges([userId]).get(userId);
  if (!badges || (!badges.verified && !(withHost && badges.trustedHost))) return null;
  return (
    <View style={styles.row}>
      {badges.verified && (
        <View accessible accessibilityLabel={t('verify.badge')}>
          <Icon name="shield" size={size} color={Colors.violetText} />
        </View>
      )}
      {withHost && badges.trustedHost && (
        <View style={styles.host}>
          <Text style={styles.hostText}>⭐ {t('verify.trustedHost')}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  host: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: Colors.amberTint },
  hostText: { ...Type.small, fontSize: 11, lineHeight: 15, fontWeight: '800', color: Colors.amberText },
}));
