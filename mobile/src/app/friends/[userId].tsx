import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatAvatar } from '@/components/chat-avatar';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { countryName, flagEmoji } from '@/lib/profile-options';
import { useFriendsOf, useProfile } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';

// Someone's friends: people who follow each other. Opened from the Friends box on a profile.
export default function FriendsScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { session } = useAuth();
  const friends = useFriendsOf(userId);
  const { state } = useProfile(userId);
  const isMe = session?.user.id === userId;
  const title = isMe
    ? t('profile.myFriends')
    : state.status === 'ready'
      ? t('profile.friendsTitle', { name: state.profile.display_name })
      : t('profile.friendsBox');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={title} />
      {friends === null ? (
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      ) : friends === 'error' ? (
        <Text style={styles.centerText}>{t('profile.loadFailed')}</Text>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(friend) => friend.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="group" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('profile.noFriends')}</Text>
              <Text style={styles.centerText}>{t('profile.noFriendsHint')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: item.id } })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <GlossyFill />
              <ChatAvatar name={item.display_name} photoPath={item.avatar_path} size={48} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                </Text>
                {item.home_country && (
                  <Text style={styles.meta} numberOfLines={1}>
                    {flagEmoji(item.home_country)} {countryName(item.home_country, language)}
                  </Text>
                )}
              </View>
              <Icon name="chevronRight" size={20} color={Colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl * 2 },
  list: { padding: Spacing.lg, gap: Spacing.sm, flexGrow: 1 },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxl * 2, paddingHorizontal: Spacing.xl },
  emptyTitle: { ...Type.heading, color: Colors.text },
  centerText: { ...Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  pressed: { opacity: 0.75 },
  rowText: { flex: 1 },
  name: { ...Type.heading, color: Colors.text },
  meta: { ...Type.small, color: Colors.textSecondary },
}));
