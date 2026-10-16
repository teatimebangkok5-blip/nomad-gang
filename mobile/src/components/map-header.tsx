import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// Floating top of a full-screen map screen (Create table, Create hangout): back button, title, an optional hint and
// anything below (e.g. filter buttons), over a fade so it stays readable. Reports its height so the map can keep
// its center clear of it.
export function MapHeader({
  title,
  hint,
  children,
  onHeight,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
  onHeight: (height: number) => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.top} pointerEvents="box-none" onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <LinearGradient colors={Colors.fade} locations={[0, 0.7, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.bar, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon name="back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.titles} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {hint ? (
            <Text style={styles.hint} numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
      {children ? <View style={styles.below}>{children}</View> : null}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: Spacing.xl },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
  back: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  pressed: { opacity: 0.7 },
  titles: { flex: 1, paddingRight: Spacing.sm },
  title: { ...Type.heading, color: Colors.text },
  hint: { ...Type.small, color: Colors.textSecondary },
  below: { marginTop: Spacing.md },
}));
