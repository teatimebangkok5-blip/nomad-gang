import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { avatarColor, Radius, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { profilePhotoUrl } from '@/lib/photos';
import { openSafetyMenu } from '@/lib/safety-menu';
import { deleteStory, groupStories, reloadStories, storyAge, useStories, useStoryPhotoUrl } from '@/lib/stories';
import { makeStyles } from '@/lib/theme';

// One person's live stories, full screen and oldest first: tap the right side for the next one, the left side for
// the previous one. The header has their name (tap → profile), how long ago and the area; the ⋮ menu deletes my own
// story, or reports / blocks someone else.
export default function StoryScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { stories } = useStories(!!session);
  const group = stories ? groupStories(stories).find((g) => g.userId === userId) : undefined;
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const count = group?.stories.length ?? 0;
  const position = Math.min(index, Math.max(count - 1, 0));
  const story = group?.stories[position] ?? null;
  const photoUrl = useStoryPhotoUrl(story?.photo_path ?? null);
  const mine = !!session && story?.user_id === session.user.id;

  function next() {
    if (position + 1 < count) setIndex(position + 1);
    else router.back();
  }

  function openMenu() {
    if (!story || !session) return;
    if (mine) {
      Alert.alert(t('stories.deleteConfirm'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('stories.delete'),
          style: 'destructive',
          onPress: () =>
            deleteStory(story).then((ok) => {
              if (!ok) Alert.alert(t('stories.deleteFailed'));
              else if (count <= 1) router.back();
            }),
        },
      ]);
      return;
    }
    openSafetyMenu({
      t,
      name: story.display_name,
      myId: session.user.id,
      otherId: story.user_id,
      context: 'story',
      contextId: story.id,
      onReported: () => reloadStories(),
      onBlocked: () => {
        reloadStories();
        router.back();
      },
    });
  }

  if (stories === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!group || !story) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.gone}>{t('stories.gone')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.goneButton} hitSlop={8}>
          <Text style={styles.goneLink}>{t('common.back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const age = storyAge(story.created_at, now);
  const ageLabel = age.key === 'justNow' ? t('stories.justNow') : t(`stories.${age.key}`, { count: age.count });
  const area = language === 'th' ? story.area_name_th : story.area_name_en;
  const initials = group.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('');

  return (
    <View style={styles.root}>
      {photoUrl === null ? (
        <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} />
      ) : photoUrl === 'error' ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={styles.gone}>{t('stories.loadFailed')}</Text>
        </View>
      ) : (
        <Image source={photoUrl} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityIgnoresInvertColors />
      )}

      {/* Tap zones: left third = previous, the rest = next. */}
      <View style={[StyleSheet.absoluteFill, styles.zones]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('stories.previous')}
          style={styles.zoneLeft}
          onPress={() => setIndex(Math.max(position - 1, 0))}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t('stories.next')} style={styles.zoneRight} onPress={next} />
      </View>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.bars}>
          {group.stories.map((item, i) => (
            <View key={item.id} style={[styles.bar, i <= position && styles.barDone]} />
          ))}
        </View>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: group.userId } })}
            style={styles.who}
            hitSlop={6}>
            <View style={[styles.avatar, { backgroundColor: avatarColor(group.userId) }]}>
              {group.avatarPath ? (
                <Image source={profilePhotoUrl(group.avatarPath)} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <Text style={styles.initials}>{initials}</Text>
              )}
            </View>
            <View style={styles.whoText}>
              <Text style={styles.name} numberOfLines={1}>
                {group.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {ageLabel}
                {area ? ` · ${t('stories.near', { area })}` : ''}
                {story.audience === 'friends' ? ` · 👥 ${t('stories.audience.friends')}` : ''}
              </Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('stories.options')} onPress={openMenu} hitSlop={10} style={styles.iconButton}>
            <Icon name="more" size={24} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => router.back()} hitSlop={10} style={styles.iconButton}>
            <Icon name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      {story.caption ? (
        <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="none">
          <Text style={styles.caption}>{story.caption}</Text>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

// The viewer is always dark (photos look best on black), in both themes.
const useStyles = makeStyles(() => ({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  gone: { ...Type.body, color: '#FFFFFF', textAlign: 'center', paddingHorizontal: Spacing.xl },
  goneButton: { marginTop: Spacing.lg, minHeight: 44, justifyContent: 'center' },
  goneLink: { ...Type.label, color: '#FFFFFF', textDecorationLine: 'underline' },
  zones: { flexDirection: 'row' },
  zoneLeft: { flex: 1 },
  zoneRight: { flex: 2 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  barDone: { backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  whoText: { flex: 1 },
  name: { ...Type.label, color: '#FFFFFF' },
  meta: { ...Type.small, color: 'rgba(255,255,255,0.8)' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  caption: { ...Type.body, color: '#FFFFFF', padding: Spacing.lg },
}));
