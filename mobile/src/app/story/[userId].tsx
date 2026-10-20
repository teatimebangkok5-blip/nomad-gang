import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { avatarColor, Radius, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { profilePhotoUrl } from '@/lib/photos';
import { openSafetyMenu } from '@/lib/safety-menu';
import {
  deleteStory,
  groupStories,
  likeStory,
  reloadStories,
  storyAge,
  useStories,
  useStoryLikers,
  useStoryPhotoUrl,
  type StoryLiker,
} from '@/lib/stories';
import { makeStyles, useColors } from '@/lib/theme';

// One person's live stories, full screen and oldest first: tap the right side for the next one, the left side for
// the previous one. The header has their name (tap → profile), how long ago and the area; the ⋮ menu deletes my own
// story, or reports / blocks someone else. At the bottom: ♥ to like someone's story (friends-only stories can only be
// seen, and so liked, by friends), or on my own story how many liked it (tap → who).
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
  const [likersOpen, setLikersOpen] = useState(false);
  const [liking, setLiking] = useState(false);

  function next() {
    if (position + 1 < count) setIndex(position + 1);
    else router.back();
  }

  function toggleLike() {
    if (!story || mine || liking) return;
    setLiking(true);
    likeStory(story, !story.liked).then((error) => {
      setLiking(false);
      if (error === 'not_found') Alert.alert(t('stories.gone'));
      else if (error) Alert.alert(t(`stories.likeErrors.${error}`));
    });
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

      <SafeAreaView edges={['bottom']} style={[styles.bottom, story.caption ? styles.bottomShade : null]} pointerEvents="box-none">
        {story.caption ? (
          <Text style={styles.caption} pointerEvents="none">
            {story.caption}
          </Text>
        ) : null}
        <View style={styles.actions} pointerEvents="box-none">
          {mine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('stories.likesCount', { count: story.like_count ?? 0 })}
              onPress={() => setLikersOpen(true)}
              style={({ pressed }) => [styles.likePill, pressed && styles.pressed]}>
              <Icon name="heart" size={20} color={LIKE_RED} />
              <Text style={styles.likeText}>{t('stories.likesCount', { count: story.like_count ?? 0 })}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={story.liked ? t('stories.unlike') : t('stories.like')}
              accessibilityState={{ selected: story.liked, busy: liking }}
              onPress={toggleLike}
              hitSlop={8}
              style={({ pressed }) => [styles.likePill, pressed && styles.pressed]}>
              <Icon name={story.liked ? 'heart' : 'heartOutline'} size={24} color={story.liked ? LIKE_RED : '#FFFFFF'} />
              <Text style={styles.likeText}>{story.liked ? t('stories.liked') : t('stories.like')}</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      {mine && (
        <LikersSheet
          visible={likersOpen}
          storyId={story.id}
          likeCount={story.like_count}
          onClose={() => setLikersOpen(false)}
        />
      )}
    </View>
  );
}

const LIKE_RED = '#FF4D6D';

// Who liked my story (tap a person → their profile).
function LikersSheet({
  visible,
  storyId,
  likeCount,
  onClose,
}: {
  visible: boolean;
  storyId: string;
  likeCount: number | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const likers = useStoryLikers(visible ? storyId : null, likeCount);

  function openProfile(liker: StoryLiker) {
    onClose();
    router.push({ pathname: '/profile/[userId]', params: { userId: liker.user_id } });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.sheetBackdrop} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('stories.likedBy')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={10} style={styles.iconButton}>
            <Icon name="close" size={24} color={Colors.text} />
          </Pressable>
        </View>
        {likers === null ? (
          <ActivityIndicator color={Colors.accent} style={styles.sheetSpinner} />
        ) : (
          <FlatList
            data={likers}
            keyExtractor={(liker) => liker.user_id}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={<Text style={styles.sheetEmpty}>{t('stories.noLikes')}</Text>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => openProfile(item)}
                style={({ pressed }) => [styles.likerRow, pressed && styles.pressed]}>
                <View style={[styles.likerAvatar, { backgroundColor: avatarColor(item.user_id) }]}>
                  {item.avatar_path ? (
                    <Image source={profilePhotoUrl(item.avatar_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Text style={styles.initials}>{item.display_name.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <Text style={styles.likerName} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Icon name="heart" size={18} color={LIKE_RED} />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// The viewer is always dark (photos look best on black), in both themes; the likes sheet follows the theme.
const useStyles = makeStyles((Colors) => ({
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
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomShade: { backgroundColor: 'rgba(0,0,0,0.45)' },
  caption: { ...Type.body, color: '#FFFFFF', paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.md },
  likePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  likeText: { ...Type.label, color: '#FFFFFF' },
  pressed: { opacity: 0.7 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '60%',
    backgroundColor: Colors.bg,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.lg, paddingRight: Spacing.sm, paddingTop: Spacing.sm },
  sheetTitle: { ...Type.heading, color: Colors.text, flex: 1 },
  sheetSpinner: { margin: Spacing.xl },
  sheetList: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  sheetEmpty: { ...Type.body, color: Colors.textSecondary, paddingVertical: Spacing.lg },
  likerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 56 },
  likerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  likerName: { ...Type.label, color: Colors.text, flex: 1 },
}));
