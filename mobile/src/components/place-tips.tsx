import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ChatAvatar } from '@/components/chat-avatar';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { openSafetyMenu } from '@/lib/safety-menu';
import { makeStyles, useColors } from '@/lib/theme';
import { deleteTip, saveTip, TIP_MAX, usePlaceTips, voteTip, type Tip, type TipTarget } from '@/lib/tips';

// "💡 Insider tips" on a place or partner venue card: short tips from people who've been there ("Order the crab
// omelette, ask for the terrace at sunset"), most helpful first. Anyone signed in adds one (one per place), marks
// others' tips helpful, or reports them.
export function PlaceTips({ target }: { target: TipTarget }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { tips, reload } = usePlaceTips(target);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const mine = tips?.find((tip) => tip.mine) ?? null;
  const shown = tips ? (showAll ? tips : tips.slice(0, 3)) : [];

  function startWriting() {
    setDraft(mine?.body ?? '');
    setError(null);
    setWriting(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveTip(target, draft);
    setSaving(false);
    if (result) {
      setError(t(`tips.errors.${result}`));
      return;
    }
    setWriting(false);
    reload();
  }

  function remove(tip: Tip) {
    Alert.alert(t('tips.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tips.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteTip(tip.id);
          reload();
        },
      },
    ]);
  }

  async function toggleHelpful(tip: Tip) {
    const result = await voteTip(tip.id, !tip.voted);
    if (result) Alert.alert(t(`tips.errors.${result}`));
    reload();
  }

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Text style={styles.heading}>💡 {t('tips.title')}</Text>
        {tips && tips.length > 0 && <Text style={styles.count}>{tips.length}</Text>}
      </View>

      {tips === null ? (
        <ActivityIndicator color={Colors.accent} />
      ) : tips.length === 0 && !writing ? (
        <Text style={styles.empty}>{t('tips.empty')}</Text>
      ) : (
        shown.map((tip) => (
          <View key={tip.id} style={styles.tip}>
            <GlossyFill />
            <View style={styles.tipTop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.openProfile', { name: tip.display_name })}
                onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: tip.user_id } })}
                style={styles.author}>
                <ChatAvatar name={tip.display_name} photoPath={tip.avatar_path} size={28} userId={tip.user_id} />
                <Text style={styles.authorName} numberOfLines={1}>
                  {tip.mine ? t('tables.you') : tip.display_name}
                </Text>
              </Pressable>
              {tip.mine ? (
                <View style={styles.mineActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('tips.edit')} hitSlop={8} onPress={startWriting}>
                    <Icon name="edit" size={18} color={Colors.textSecondary} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('tips.delete')} hitSlop={8} onPress={() => remove(tip)}>
                    <Icon name="delete" size={18} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              ) : (
                myId && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.more')}
                    hitSlop={8}
                    onPress={() =>
                      openSafetyMenu({
                        t,
                        name: tip.display_name,
                        myId,
                        otherId: tip.user_id,
                        context: 'tip',
                        contextId: tip.id,
                        onBlocked: reload,
                        onReported: reload,
                      })
                    }>
                    <Icon name="more" size={18} color={Colors.textMuted} />
                  </Pressable>
                )
              )}
            </View>
            <Text style={styles.body}>{tip.body}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: tip.voted, disabled: tip.mine }}
              disabled={tip.mine}
              onPress={() => toggleHelpful(tip)}
              style={({ pressed }) => [styles.helpful, tip.voted && styles.helpfulOn, pressed && styles.pressed]}>
              <Icon name="thumbUp" size={14} color={tip.voted ? Colors.violetText : Colors.textMuted} />
              <Text style={[styles.helpfulText, tip.voted && styles.helpfulTextOn]}>
                {t('tips.helpful')}
                {tip.helpful > 0 ? ` · ${tip.helpful}` : ''}
              </Text>
            </Pressable>
          </View>
        ))
      )}

      {tips && tips.length > 3 && !showAll && (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)}>
          <Text style={styles.more}>{t('tips.showAll', { count: tips.length })}</Text>
        </Pressable>
      )}

      {writing ? (
        <View style={styles.form}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('tips.placeholder')}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={TIP_MAX}
            autoFocus
            style={styles.input}
          />
          <Text style={styles.counter}>
            {draft.length}/{TIP_MAX}
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.formActions}>
            <Pressable accessibilityRole="button" onPress={() => setWriting(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving || draft.trim().length < 3}
              onPress={save}
              style={({ pressed }) => [styles.save, draft.trim().length < 3 && styles.saveOff, pressed && styles.pressed]}>
              {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.saveText}>{t('tips.post')}</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        myId && (
          <Pressable accessibilityRole="button" onPress={startWriting} style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
            <Icon name={mine ? 'edit' : 'lightbulb'} size={18} color={Colors.violetText} />
            <Text style={styles.addText}>{mine ? t('tips.editMine') : t('tips.add')}</Text>
          </Pressable>
        )
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  pressed: { opacity: 0.75 },
  box: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  heading: { ...Type.heading, fontSize: 17, color: Colors.text },
  count: {
    ...Type.small,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.violetText,
    backgroundColor: Colors.violetTint,
    paddingHorizontal: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  empty: { ...Type.small, color: Colors.textSecondary },
  tip: {
    gap: 6,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  tipTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  author: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  authorName: { ...Type.label, fontSize: 13, color: Colors.textSecondary, flexShrink: 1 },
  mineActions: { flexDirection: 'row', gap: Spacing.md },
  body: { ...Type.body, color: Colors.text },
  helpful: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceRaised,
  },
  helpfulOn: { backgroundColor: Colors.violetTint },
  helpfulText: { ...Type.small, fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  helpfulTextOn: { color: Colors.violetText },
  more: { ...Type.label, color: Colors.violetText },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  addText: { ...Type.label, color: Colors.violetText },
  form: { gap: Spacing.xs },
  input: {
    minHeight: 84,
    maxHeight: 160,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.field,
    color: Colors.text,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  counter: { ...Type.small, fontSize: 11, color: Colors.textMuted, alignSelf: 'flex-end' },
  error: { ...Type.small, color: Colors.danger },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  cancel: { minHeight: 40, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
  cancelText: { ...Type.label, color: Colors.textSecondary },
  save: {
    minHeight: 40,
    minWidth: 84,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violet,
  },
  saveOff: { backgroundColor: Colors.surfaceRaised },
  saveText: { ...Type.label, color: Colors.white },
}));
