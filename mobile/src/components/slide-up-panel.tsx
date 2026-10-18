import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundButton } from '@/components/round-button';
import { Radius, Spacing, Type } from '@/constants/theme';
import { makeStyles } from '@/lib/theme';

// The list that slides up over a full-screen map ("List" button): handle, an optional title and subtitle, a close
// button and a scrim to close it. The Android back button closes it too. Render it last so it sits on top of the
// map's floating UI.
export function SlideUpPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
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
        style={[styles.sheet, { top: insets.top + 120, paddingBottom: insets.bottom }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.titles}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <RoundButton icon="close" label={t('tables.showMap')} onPress={onClose} />
        </View>
        {children}
      </Animated.View>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10, 6, 18, 0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.overlay,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.border,
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md - 2,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  titles: { flex: 1, gap: 2 },
  title: { ...Type.title, color: Colors.text },
  subtitle: { ...Type.small, color: Colors.textMuted },
}));
