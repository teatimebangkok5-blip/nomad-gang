import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { LevelBadge } from '@/components/level-badge';
import { avatarColor, Radius, Spacing, Type } from '@/constants/theme';
import { profilePhotoUrl } from '@/lib/photos';
import { useStoryLikers, type StoryLiker } from '@/lib/stories';
import { makeStyles, useColors } from '@/lib/theme';

export const LIKE_RED = '#FF4D6D';

// Who liked my story, newest first (tap a person → their profile). Used by the story viewer and the story map.
export function StoryLikersSheet({
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
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.backdrop} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('stories.likedBy')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={10} style={styles.close}>
            <Icon name="close" size={24} color={Colors.text} />
          </Pressable>
        </View>
        {likers === null ? (
          <ActivityIndicator color={Colors.accent} style={styles.spinner} />
        ) : (
          <FlatList
            data={likers}
            keyExtractor={(liker) => liker.user_id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t('stories.noLikes')}</Text>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => openProfile(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View>
                  <View style={[styles.avatar, { backgroundColor: avatarColor(item.user_id) }]}>
                    {item.avatar_path ? (
                      <Image source={profilePhotoUrl(item.avatar_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <Text style={styles.initials}>{item.display_name.slice(0, 1).toUpperCase()}</Text>
                    )}
                  </View>
                  <LevelBadge userId={item.user_id} size={40} />
                </View>
                <Text style={styles.name} numberOfLines={1}>
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

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '60%',
    backgroundColor: Colors.bg,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.lg, paddingRight: Spacing.sm, paddingTop: Spacing.sm },
  title: { ...Type.heading, color: Colors.text, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  spinner: { margin: Spacing.xl },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  empty: { ...Type.body, color: Colors.textSecondary, paddingVertical: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 56 },
  pressed: { opacity: 0.7 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  name: { ...Type.label, color: Colors.text, flex: 1 },
}));
