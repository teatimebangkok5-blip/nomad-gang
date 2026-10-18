import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { worldPercent } from '@/components/profile-tabs';
import { BrandGradient, Radius, Spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { profilePhotoUrl } from '@/lib/photos';
import { countryName, flagEmoji, interestEmoji, interestLabel, travelStyleLabel } from '@/lib/profile-options';
import type { Profile } from '@/lib/profiles';
import { makeStyles } from '@/lib/theme';

// "Story": a 9:16 picture of the profile (photo, name, age, country, travel style, interests, countries visited) to
// share to Instagram Stories or any other app through the phone's share sheet.
export function StoryShare({ profile, visible, onClose }: { profile: Profile; visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const card = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  async function share() {
    setSharing(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080, height: 1920 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('profile.storyTitle') });
    } catch (error) {
      console.warn('Sharing story failed', error);
      Alert.alert(t('profile.storyFailed'));
    }
    setSharing(false);
  }

  const name = profile.age ? t('profile.nameAge', { name: profile.display_name, age: profile.age }) : profile.display_name;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={8} onPress={onClose} style={styles.close}>
            <Icon name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('profile.storyTitle')}</Text>
          <View style={styles.close} />
        </View>

        <View style={styles.cardWrap}>
          <View ref={card} collapsable={false} style={styles.card}>
            <LinearGradient colors={['#1A0B2E', '#0A0612']} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={[...BrandGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glow}
            />
            <Text style={styles.logo}>
              Table<Text style={styles.logoM}>M</Text>
              <Text style={styles.logoEet}>eet</Text>
            </Text>

            <View style={styles.avatarRing}>
              <LinearGradient colors={[...BrandGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={styles.avatar}>
                {profile.avatar_path ? (
                  <Image source={profilePhotoUrl(profile.avatar_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Text style={styles.initial}>{profile.display_name.slice(0, 1).toUpperCase() || '?'}</Text>
                )}
              </View>
            </View>

            <Text style={styles.name} numberOfLines={2}>
              {name}
            </Text>
            {profile.home_country && (
              <Text style={styles.from}>
                {t('profile.from', { country: `${flagEmoji(profile.home_country)} ${countryName(profile.home_country, language)}` })}
              </Text>
            )}
            {profile.travel_style && <Text style={styles.style}>{travelStyleLabel(t, profile.travel_style)}</Text>}

            {profile.interests.length > 0 && (
              <View style={styles.tags}>
                {profile.interests.slice(0, 5).map((key) => (
                  <Text key={key} style={styles.tag}>
                    {interestEmoji(key)} {interestLabel(t, key)}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{profile.visited_countries.length}</Text>
                <Text style={styles.statLabel}>{t('profile.countries')}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{worldPercent(profile.visited_countries.length)}%</Text>
                <Text style={styles.statLabel}>{t('profile.world')}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{profile.tables + profile.hangouts}</Text>
                <Text style={styles.statLabel}>{t('profile.metUp')}</Text>
              </View>
            </View>

            <Text style={styles.cta}>{t('profile.storyMessage')}</Text>
            <Text style={styles.tagline}>{t('profile.storyTagline')}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Button title={t('profile.story')} icon={<Icon name="share" size={20} color="#0A0612" />} loading={sharing} onPress={share} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// The card always uses the dark brand look (it's an image for other apps), in both themes.
const useStyles = makeStyles(() => ({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.sm },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  cardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  card: {
    height: '100%',
    aspectRatio: 9 / 16,
    maxWidth: '100%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
  },
  glow: { position: 'absolute', top: -120, left: -60, right: -60, height: 260, opacity: 0.35, borderRadius: 200 },
  logo: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  logoM: { color: '#FF9A1B' },
  logoEet: { color: '#FF1F78' },
  avatarRing: { marginTop: Spacing.xl, width: 136, height: 136, borderRadius: 68, padding: 4, overflow: 'hidden' },
  avatar: {
    flex: 1,
    borderRadius: 64,
    backgroundColor: '#211633',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: { fontSize: 52, fontWeight: '800', color: '#FFFFFF' },
  name: { marginTop: Spacing.lg, fontSize: 28, lineHeight: 34, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  from: { marginTop: Spacing.xs, fontSize: 15, color: '#CBC0DE' },
  style: { marginTop: Spacing.xs, fontSize: 15, fontWeight: '700', color: '#F6C98F' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: Spacing.lg },
  tag: {
    fontSize: 13,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  stats: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.xl },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 12, color: '#968AAE' },
  cta: { marginTop: 'auto', fontSize: 18, fontWeight: '800', color: '#FF9A1B', textAlign: 'center' },
  tagline: { marginTop: 2, marginBottom: Spacing.xxl, fontSize: 13, color: '#CBC0DE' },
  footer: { padding: Spacing.lg },
}));
