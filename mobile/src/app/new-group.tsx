import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmojiPicker } from '@/components/emoji-picker';
import { FriendPicker } from '@/components/friend-picker';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { createGroup, GROUP_EMOJIS, useFriends, type GroupErrorKey } from '@/lib/messages';
import { makeStyles, useColors } from '@/lib/theme';

const MAX_PEOPLE = 100;

// New group chat: a name, an emoji and friends (people who follow each other). Up to 100 people with me.
export default function NewGroupScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const friends = useFriends();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<GroupErrorKey | null>(null);

  const canCreate = name.trim().length > 0 && selected.length > 0 && selected.length < MAX_PEOPLE && !creating;

  function toggle(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function create() {
    setCreating(true);
    setError(null);
    const result = await createGroup(name.trim(), emoji, selected);
    setCreating(false);
    if (result.error || !result.id) {
      setError(result.error ?? 'generic');
      return;
    }
    router.replace({ pathname: '/group/[id]', params: { id: result.id } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('messages.newGroup')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.preview}>
            <Text style={styles.previewEmoji}>{emoji}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('messages.groupNamePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              selectionColor={Colors.violet}
              keyboardAppearance="dark"
              maxLength={50}
              accessibilityLabel={t('messages.groupName')}
              style={styles.input}
            />
          </View>

          <Text style={styles.label}>{t('messages.groupEmoji')}</Text>
          <EmojiPicker value={emoji} onChange={setEmoji} />

          <Text style={styles.label}>
            {t('messages.addFriends')} {selected.length > 0 ? `(${selected.length})` : ''}
          </Text>
          <Text style={styles.hint}>{t('messages.friendsOnly')}</Text>
          <FriendPicker friends={friends} selected={selected} onToggle={toggle} />

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`messages.errors.${error}`)}
            </Text>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('messages.createGroup')} variant="violet" onPress={create} loading={creating} disabled={!canCreate} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  previewEmoji: { fontSize: 40 },
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
  hint: { ...Type.small, color: Colors.textMuted, marginTop: -Spacing.xs, marginBottom: Spacing.sm },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  footer: { padding: Spacing.lg, paddingTop: Spacing.sm },
}));
