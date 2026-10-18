import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundButton } from '@/components/round-button';
import { Spacing, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// Floating top of a full-screen map screen (Create table, Create hangout): close button, title, an optional hint
// (e.g. "Step 1 of 2"), an optional button on the right and anything below (search, filter buttons), over a fade so
// it stays readable. Reports its height so the map can keep its center clear of it.
export function MapHeader({
  title,
  hint,
  right,
  children,
  onHeight,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children?: ReactNode;
  onHeight: (height: number) => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.top} pointerEvents="box-none" onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <LinearGradient colors={Colors.fade} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.bar, { paddingTop: insets.top + Spacing.sm }]}>
        <RoundButton
          icon="close"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
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
        {right}
      </View>
      {children ? (
        <View style={styles.below} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: Spacing.lg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md - 2, paddingHorizontal: Spacing.md },
  titles: { flex: 1 },
  title: { ...Type.heading, fontSize: 18, fontWeight: '800', color: Colors.text },
  hint: { ...Type.small, fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  below: { marginTop: Spacing.md - 2, gap: Spacing.md - 2 },
}));
