import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chat-avatar';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import type { Friend } from '@/lib/messages';
import { makeStyles, useColors } from '@/lib/theme';

// Tick friends (mutual follows) to put in a group. `exclude`: people already in it.
export function FriendPicker({
  friends,
  selected,
  onToggle,
  exclude = [],
}: {
  friends: Friend[] | null;
  selected: string[];
  onToggle: (id: string) => void;
  exclude?: string[];
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();

  if (friends === null) return <ActivityIndicator color={Colors.accent} style={styles.spinner} />;
  const choices = friends.filter((friend) => !exclude.includes(friend.id));
  if (choices.length === 0) {
    return (
      <View style={styles.empty}>
        <GlossyFill />
        <Text style={styles.emptyTitle}>{friends.length === 0 ? t('messages.noFriends') : t('messages.allFriendsIn')}</Text>
        {friends.length === 0 && <Text style={styles.emptyBody}>{t('messages.noFriendsBody')}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {choices.map((friend) => {
        const on = selected.includes(friend.id);
        return (
          <Pressable
            key={friend.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(friend.id)}
            style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}>
            <GlossyFill />
            <ChatAvatar name={friend.display_name} photoPath={friend.avatar_path} size={40} userId={friend.id} />
            <Text style={styles.name} numberOfLines={1}>
              {friend.display_name}
            </Text>
            <View style={[styles.check, on && styles.checkOn]}>
              {on && <Icon name="check" size={16} color={Colors.white} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  spinner: { marginVertical: Spacing.lg },
  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    paddingRight: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  rowOn: { borderColor: Colors.violet },
  pressed: { opacity: 0.7 },
  name: { ...Type.label, color: Colors.text, flex: 1 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Colors.violet, borderColor: Colors.violet },
  empty: {
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  emptyBody: { ...Type.body, color: Colors.textSecondary },
}));
