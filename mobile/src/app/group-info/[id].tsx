import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ChatAvatar } from '@/components/chat-avatar';
import { EmojiPicker } from '@/components/emoji-picker';
import { FriendPicker } from '@/components/friend-picker';
import { GlossyFill } from '@/components/glossy';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  addGroupMembers,
  leaveChat,
  removeGroupMember,
  renameGroup,
  useFriends,
  useGroup,
  type GroupErrorKey,
  type GroupInfo,
} from '@/lib/messages';
import { makeStyles, useColors } from '@/lib/theme';

const MAX_PEOPLE = 100;

// Group info: members (tap to open a profile), add friends (any member), remove people / rename (owner), leave.
export default function GroupInfoScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { group, reload } = useGroup(id);
  const [error, setError] = useState<GroupErrorKey | null>(null);

  if (group === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader />
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      </SafeAreaView>
    );
  }
  if (group === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader />
        <Text style={styles.notice}>{t('messages.notInGroup')}</Text>
      </SafeAreaView>
    );
  }

  const isOwner = group.owner_id === myId;

  async function run(action: Promise<GroupErrorKey | null>) {
    setError(null);
    const result = await action;
    if (result) setError(result);
    reload();
    return result;
  }

  function confirmRemove(userId: string, name: string) {
    Alert.alert(t('messages.removeTitle', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('messages.remove'), style: 'destructive', onPress: () => run(removeGroupMember(id, userId)) },
    ]);
  }

  function confirmLeave() {
    if (!group || group === 'loading') return;
    Alert.alert(t('messages.leaveGroup'), t('messages.leaveGroupBody', { name: group.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('messages.leave'),
        style: 'destructive',
        onPress: async () => {
          const result = await leaveChat('group', id);
          if (result) setError(result);
          else router.dismissTo('/messages');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('messages.groupInfo')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isOwner ? (
          <RenameBox group={group} onSave={(name, emoji) => run(renameGroup(id, name, emoji))} />
        ) : (
          <View style={styles.titleRow}>
            <Text style={styles.bigEmoji}>{group.emoji}</Text>
            <Text style={styles.groupName}>{group.name}</Text>
          </View>
        )}

        <Text style={styles.label}>{t('messages.people', { count: group.members.length })}</Text>
        <View style={styles.list}>
          {group.members.map((member) => (
            <View key={member.user_id} style={styles.member}>
              <GlossyFill />
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: member.user_id } })}
                style={({ pressed }) => [styles.memberMain, pressed && styles.pressed]}>
                <ChatAvatar name={member.display_name} photoPath={member.avatar_path} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.display_name}
                    {member.user_id === myId ? ` (${t('messages.you')})` : ''}
                  </Text>
                  {member.user_id === group.owner_id && <Text style={styles.ownerTag}>{t('messages.owner')}</Text>}
                </View>
              </Pressable>
              {isOwner && member.user_id !== myId && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('messages.removeTitle', { name: member.display_name })}
                  hitSlop={8}
                  onPress={() => confirmRemove(member.user_id, member.display_name)}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
                  <Text style={styles.removeText}>{t('messages.remove')}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        <AddFriends group={group} onAdd={(ids) => run(addGroupMembers(id, ids))} />

        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {t(`messages.errors.${error}`)}
          </Text>
        )}

        <View style={styles.leave}>
          <Button title={t('messages.leaveGroup')} variant="secondary" onPress={confirmLeave} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RenameBox({ group, onSave }: { group: GroupInfo; onSave: (name: string, emoji: string) => Promise<GroupErrorKey | null> }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== group.name || emoji !== group.emoji;

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.bigEmoji}>{emoji}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={50}
          accessibilityLabel={t('messages.groupName')}
          placeholder={t('messages.groupNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          selectionColor={Colors.violet}
          keyboardAppearance="dark"
          style={styles.input}
        />
      </View>
      <Text style={styles.label}>{t('messages.groupEmoji')}</Text>
      <EmojiPicker value={emoji} onChange={setEmoji} />
      {changed && (
        <View style={styles.saveRow}>
          <Button
            title={t('messages.save')}
            variant="violet"
            loading={saving}
            disabled={!name.trim()}
            onPress={async () => {
              setSaving(true);
              await onSave(name.trim(), emoji);
              setSaving(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

function AddFriends({ group, onAdd }: { group: GroupInfo; onAdd: (ids: string[]) => Promise<GroupErrorKey | null> }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const friends = useFriends();
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const room = MAX_PEOPLE - group.members.length;

  if (!open) {
    return (
      <View style={styles.addButton}>
        <Button
          title={t('messages.addFriends')}
          variant="secondary"
          disabled={room <= 0}
          onPress={() => setOpen(true)}
        />
        {room <= 0 && <Text style={styles.hint}>{t('messages.errors.group_full')}</Text>}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.label}>{t('messages.addFriends')}</Text>
      <Text style={styles.hint}>{t('messages.friendsOnly')}</Text>
      <FriendPicker
        friends={friends}
        selected={selected}
        exclude={group.members.map((member) => member.user_id)}
        onToggle={(friendId) =>
          setSelected((list) => (list.includes(friendId) ? list.filter((x) => x !== friendId) : [...list, friendId]))
        }
      />
      <View style={styles.saveRow}>
        <Button
          title={t('messages.addSelected', { count: selected.length })}
          variant="violet"
          loading={adding}
          disabled={selected.length === 0 || selected.length > room}
          onPress={async () => {
            setAdding(true);
            const error = await onAdd(selected);
            setAdding(false);
            if (!error) {
              setSelected([]);
              setOpen(false);
            }
          }}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl },
  pressed: { opacity: 0.7 },
  notice: { ...Type.body, color: Colors.textSecondary, padding: Spacing.lg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  bigEmoji: { fontSize: 40 },
  groupName: { ...Type.title, color: Colors.text, flex: 1 },
  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.text,
  },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  hint: { ...Type.small, color: Colors.textMuted, marginBottom: Spacing.sm },
  list: { gap: Spacing.sm },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    paddingRight: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  memberName: { ...Type.label, color: Colors.text },
  ownerTag: { ...Type.small, fontSize: 12, color: Colors.accent, fontWeight: '700' },
  removeButton: {
    minHeight: 34,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  removeText: { ...Type.small, color: Colors.danger, fontWeight: '700' },
  addButton: { marginTop: Spacing.lg },
  saveRow: { marginTop: Spacing.md },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  leave: { marginTop: Spacing.xxl },
}));
