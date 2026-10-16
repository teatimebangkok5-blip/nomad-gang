import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// The list that slides up over a full-screen map ("List" button), with a "Map" button and a scrim to close it.
// The Android back button closes it too. Render it last so it sits on top of the map's floating UI.
export function SlideUpPanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('tables.showMap')} />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(260)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { top: insets.top + 72, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.handle} />
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}>
            <Icon name="map" size={18} color={Colors.text} />
            <Text style={styles.mapButtonText}>{t('tables.showMap')}</Text>
          </Pressable>
        </View>
        {children}
      </Animated.View>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.bg,
    borderTopLeftRadius: Radius.lg + 8,
    borderTopRightRadius: Radius.lg + 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-end',
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  mapButtonText: { ...Type.label, color: Colors.text },
  pressed: { opacity: 0.7 },
}));
