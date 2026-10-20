import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { LIKE_RED, StoryLikersSheet } from '@/components/story-likers-sheet';
import { VenueMap, type MapFocus, type MapPin } from '@/components/venue-map';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { deviceZone, formatWhen } from '@/lib/bangkok-time';
import { distanceMeters } from '@/lib/location';
import { openSafetyMenu } from '@/lib/safety-menu';
import { deleteStory, likeStory, useStoryMap, useStoryPhotoUrls, type StoryMapItem } from '@/lib/stories';
import { makeStyles, useColors } from '@/lib/theme';

const CARD_WIDTH = 236;
const CARD_GAP = Spacing.sm;
const TIMELINE_HEIGHT = 128;

// Story map: someone's stories of the last 10 days (the ones I may see) on a map, numbered and joined by a line in
// the order they were posted, so you can see where they've been. The timeline at the bottom lists them oldest first:
// tap a card (or a pin) to go there, tap the selected card again to open the photo full screen (like it, or on my
// own stories see who liked it / delete it).
export default function StoryMapScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const mine = !!session && session.user.id === userId;
  const { items, reload } = useStoryMap(userId ?? null);
  const list = Array.isArray(items) ? items : [];
  const photoUrls = useStoryPhotoUrls(list.map((item) => item.photo_path));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const timeline = useRef<FlatList<StoryMapItem>>(null);

  const zone = deviceZone();
  const now = new Date();
  let meters = 0;
  for (let i = 1; i < list.length; i++) meters += distanceMeters(list[i - 1], list[i]);
  const km = Math.round(meters / 1000);

  const pins: MapPin[] = list.map((item, index) => ({
    key: item.id,
    lat: item.lat,
    lng: item.lng,
    emoji: '📸',
    tone: 'story',
    image: photoUrls.get(item.photo_path) ?? null,
    count: index + 1,
    selected: item.id === selectedId,
    accessibilityLabel: t('storyMap.pinLabel', { number: index + 1, when: formatWhen(item.created_at, t, now, zone) }),
  }));

  function select(item: StoryMapItem, index: number, scroll: boolean) {
    setSelectedId(item.id);
    setFocus({ lat: item.lat, lng: item.lng, zoom: 14, seq: Date.now() });
    if (scroll) timeline.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }

  const title = mine ? t('storyMap.mine') : name ? t('storyMap.title', { name }) : t('storyMap.titleShort');
  const subtitle =
    list.length > 0
      ? list.length > 1
        ? t('storyMap.summary', { count: list.length, km: km.toLocaleString(language === 'th' ? 'th-TH' : 'en-GB') })
        : t('storyMap.summaryOne')
      : t('storyMap.lastDays', { days: 10 });
  const viewing = list.find((item) => item.id === viewerId) ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={title} subtitle={subtitle} />
      <View style={styles.flex}>
        <VenueMap
          fullScreen
          pins={pins}
          onPinPress={(key) => {
            const index = list.findIndex((item) => item.id === key);
            if (index >= 0) select(list[index], index, true);
          }}
          userCoords={null}
          route={list.length > 1 ? list.map((item) => ({ lat: item.lat, lng: item.lng })) : undefined}
          center={list.length === 1 ? { lat: list[0].lat, lng: list[0].lng } : null}
          focus={focus}
          initialZoom={list.length === 1 ? 14 : 11}
          mapPadding={{ top: 0, right: 0, bottom: list.length ? TIMELINE_HEIGHT + Spacing.lg : 0, left: 0 }}
        />

        {items === null ? (
          <View style={styles.overlayCard}>
            <GlossyFill />
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : items === 'error' ? (
          <View style={styles.overlayCard}>
            <GlossyFill />
            <Text style={styles.body}>{t('storyMap.loadFailed')}</Text>
            <Pressable accessibilityRole="button" onPress={reload} hitSlop={8} style={styles.retry}>
              <Text style={styles.link}>{t('common.tryAgain')}</Text>
            </Pressable>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.overlayCard}>
            <GlossyFill />
            <Text style={styles.cardTitle}>🗺️ {t('storyMap.emptyTitle')}</Text>
            <Text style={styles.body}>{mine ? t('storyMap.emptyMine', { days: 10 }) : t('storyMap.emptyOther', { days: 10 })}</Text>
            {mine && <Button title={t('stories.add')} onPress={() => router.push('/post-story')} />}
          </View>
        ) : (
          <FlatList
            ref={timeline}
            horizontal
            data={list}
            keyExtractor={(item) => item.id}
            style={styles.timeline}
            contentContainerStyle={styles.timelineContent}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: CARD_WIDTH + CARD_GAP, offset: (CARD_WIDTH + CARD_GAP) * index, index })}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item, index }) => {
              const selected = item.id === selectedId;
              const area = language === 'th' ? item.area_name_th : item.area_name_en;
              const url = photoUrls.get(item.photo_path);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityHint={selected ? t('storyMap.openHint') : t('storyMap.goHint')}
                  onPress={() => (selected ? setViewerId(item.id) : select(item, index, false))}
                  style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}>
                  <GlossyFill />
                  <View style={styles.thumb}>
                    {url ? <Image source={url} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.thumbEmoji}>📸</Text>}
                    <View style={styles.number}>
                      <Text style={styles.numberText}>{index + 1}</Text>
                    </View>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.when} numberOfLines={1}>
                      {formatWhen(item.created_at, t, now, zone)}
                    </Text>
                    {area ? (
                      <Text style={styles.meta} numberOfLines={1}>
                        📍 {area}
                      </Text>
                    ) : null}
                    {item.caption ? (
                      <Text style={styles.caption} numberOfLines={2}>
                        {item.caption}
                      </Text>
                    ) : null}
                    <View style={styles.tags}>
                      {item.on_map && <Text style={styles.liveTag}>{t('storyMap.onMapNow')}</Text>}
                      {item.audience === 'friends' && <Text style={styles.meta}>👥</Text>}
                      {mine ? (
                        <Text style={styles.meta}>♥ {item.like_count ?? 0}</Text>
                      ) : item.liked ? (
                        <Icon name="heart" size={14} color={LIKE_RED} />
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {viewing && (
        <StoryPhotoViewer
          item={viewing}
          number={list.indexOf(viewing) + 1}
          url={photoUrls.get(viewing.photo_path) ?? null}
          mine={mine}
          ownerId={userId ?? ''}
          ownerName={name ?? ''}
          onClose={() => setViewerId(null)}
          onChanged={reload}
        />
      )}
    </SafeAreaView>
  );
}

// One story full screen: the photo, when and where, the caption, and ♥ (others) or "N liked it" + delete (mine).
function StoryPhotoViewer({
  item,
  number,
  url,
  mine,
  ownerId,
  ownerName,
  onClose,
  onChanged,
}: {
  item: StoryMapItem;
  number: number;
  url: string | null;
  mine: boolean;
  ownerId: string;
  ownerName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const [liked, setLiked] = useState(item.liked);
  const [busy, setBusy] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  const area = language === 'th' ? item.area_name_th : item.area_name_en;
  const when = formatWhen(item.created_at, t, new Date(), deviceZone());

  function toggleLike() {
    if (busy) return;
    const next = !liked;
    setBusy(true);
    setLiked(next);
    likeStory(item, next).then((error) => {
      setBusy(false);
      if (error) {
        setLiked(!next);
        Alert.alert(error === 'not_found' ? t('stories.gone') : t(`stories.likeErrors.${error}`));
      }
      onChanged();
    });
  }

  function openMenu() {
    if (!session) return;
    if (mine) {
      Alert.alert(t('stories.deleteConfirm'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('stories.delete'),
          style: 'destructive',
          onPress: () =>
            deleteStory(item).then((ok) => {
              if (!ok) {
                Alert.alert(t('stories.deleteFailed'));
                return;
              }
              onClose();
              onChanged();
            }),
        },
      ]);
      return;
    }
    openSafetyMenu({
      t,
      name: ownerName || t('storyMap.thisPerson'),
      myId: session.user.id,
      otherId: ownerId,
      context: 'story',
      contextId: item.id,
      onReported: () => {
        onClose();
        onChanged();
      },
      onBlocked: () => {
        onClose();
        router.back();
      },
    });
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {url ? (
          <Image source={url} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityIgnoresInvertColors />
        ) : (
          <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} />
        )}
        <SafeAreaView edges={['top']} style={styles.viewerTop}>
          <View style={styles.viewerHeader}>
            <View style={styles.flex}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                {t('storyMap.storyNumber', { number })} · {when}
              </Text>
              {area ? (
                <Text style={styles.viewerMeta} numberOfLines={1}>
                  📍 {area}
                </Text>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('stories.options')} onPress={openMenu} hitSlop={10} style={styles.viewerButton}>
              <Icon name="more" size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={10} style={styles.viewerButton}>
              <Icon name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
        </SafeAreaView>
        <SafeAreaView edges={['bottom']} style={[styles.viewerBottom, item.caption ? styles.viewerShade : null]}>
          {item.caption ? <Text style={styles.viewerCaption}>{item.caption}</Text> : null}
          <View style={styles.viewerActions}>
            {mine ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setLikersOpen(true)}
                style={({ pressed }) => [styles.likePill, pressed && styles.pressed]}>
                <Icon name="heart" size={20} color={LIKE_RED} />
                <Text style={styles.likeText}>{t('stories.likesCount', { count: item.like_count ?? 0 })}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={liked ? t('stories.unlike') : t('stories.like')}
                accessibilityState={{ selected: liked, busy }}
                onPress={toggleLike}
                hitSlop={8}
                style={({ pressed }) => [styles.likePill, pressed && styles.pressed]}>
                <Icon name={liked ? 'heart' : 'heartOutline'} size={24} color={liked ? LIKE_RED : '#FFFFFF'} />
                <Text style={styles.likeText}>{liked ? t('stories.liked') : t('stories.like')}</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
        {mine && (
          <StoryLikersSheet visible={likersOpen} storyId={item.id} likeCount={item.like_count} onClose={() => setLikersOpen(false)} />
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  body: { ...Type.body, color: Colors.textSecondary },
  link: { ...Type.label, color: Colors.accent },
  retry: { minHeight: 44, justifyContent: 'center' },
  cardTitle: { ...Type.heading, color: Colors.text },
  overlayCard: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  timeline: { position: 'absolute', left: 0, right: 0, bottom: Spacing.md, height: TIMELINE_HEIGHT },
  timelineContent: { paddingHorizontal: Spacing.lg, gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    height: TIMELINE_HEIGHT,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  cardSelected: { borderColor: Colors.pink },
  thumb: {
    width: 82,
    borderRadius: Radius.md,
    backgroundColor: Colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbEmoji: { fontSize: 26 },
  number: {
    position: 'absolute',
    top: 4,
    left: 4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: 'rgba(10, 6, 18, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#FFFFFF' },
  when: { ...Type.label, color: Colors.text },
  meta: { ...Type.small, fontSize: 12, color: Colors.textSecondary },
  caption: { ...Type.small, color: Colors.text, marginTop: 2 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 'auto' },
  liveTag: {
    ...Type.small,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.pinkText,
    backgroundColor: Colors.pinkTint,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },

  // The full-screen photo is always dark, in both themes.
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerTop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  viewerTitle: { ...Type.label, color: '#FFFFFF' },
  viewerMeta: { ...Type.small, color: 'rgba(255,255,255,0.8)' },
  viewerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  viewerBottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  viewerShade: { backgroundColor: 'rgba(0,0,0,0.45)' },
  viewerCaption: { ...Type.body, color: '#FFFFFF', paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  viewerActions: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.md },
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
}));
