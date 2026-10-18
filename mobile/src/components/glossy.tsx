import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { Raised, RaisedSmall, Tones, type Tone } from '@/constants/theme';
import { useColors } from '@/lib/theme';

// The app's glossy 3D look. Drop these into a container that has a borderRadius and `overflow: 'hidden'`, plus a
// Raised / RaisedSmall shadow from src/constants/theme.ts:
// - <GlossyFill /> paints the surface gradient (light top → base bottom) and the shine.
// - <Shine /> is only the shine, for containers that already have their own color or gradient (e.g. brand buttons).
// `onColor`: a white shine for orange / violet / pink fills (the theme shine is faint on dark).
// The shine covers the top half and stops sharply, like a glossy button.
const WHITE_SHINE = ['rgba(255, 255, 255, 0.36)', 'rgba(255, 255, 255, 0.07)'] as const;

export function Shine({ strength = 1, onColor = false }: { strength?: number; onColor?: boolean }) {
  const Colors = useColors();
  return (
    <LinearGradient
      colors={onColor ? WHITE_SHINE : Colors.shine}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.shine, { opacity: strength }]}
      pointerEvents="none"
    />
  );
}

// A brand fill (orange, violet, lilac, plan, brand) with its shine, for buttons, selected chips and badges. Put it
// first inside a container with a borderRadius and `overflow: 'hidden'`.
export function ToneFill({ tone, shine = true }: { tone: Tone; shine?: boolean }) {
  const fill = Tones[tone];
  return (
    <>
      <LinearGradient
        colors={fill.colors}
        locations={fill.locations}
        start={fill.horizontal ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
        end={fill.horizontal ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {shine && <Shine onColor />}
    </>
  );
}

export function GlossyFill() {
  const Colors = useColors();
  return (
    <>
      <LinearGradient
        colors={Colors.surfaceGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Shine />
    </>
  );
}

type Lift = 'normal' | 'small' | 'none';
const lift = (raised: Lift) => (raised === 'normal' ? Raised : raised === 'small' ? RaisedSmall : null);

// A box with the glossy 3D look: surface gradient, shine, raised shadow. Give it a borderRadius in its style.
export function GlossyView({ style, children, raised = 'normal', ...rest }: ViewProps & { raised?: Lift }) {
  return (
    <View style={[styles.clip, lift(raised), style]} {...rest}>
      <GlossyFill />
      {children}
    </View>
  );
}

// A pressable with the glossy 3D look (cards, round buttons). Children are plain elements.
export function GlossyPressable({
  style,
  children,
  raised = 'small',
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: ReactNode;
  raised?: Lift;
}) {
  return (
    <Pressable
      style={(state) => [styles.clip, lift(raised), typeof style === 'function' ? style(state) : style]}
      {...rest}>
      <GlossyFill />
      {children}
    </Pressable>
  );
}

// Our own Instagram-style badge (sunset gradient, white camera, shine). Not Instagram's logo, whose brand rules
// don't allow changing it.
export function InstagramBadge({ size = 30 }: { size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <LinearGradient
        colors={['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.badgeShine, { borderRadius: size * 0.3 }]}
      />
      <Icon name="camera" size={size * 0.6} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  badgeShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
});
