import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ChatView } from '@/components/chat-view';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { respondToRequest, sendDirectMessage, useDirectChat, type ChatErrorKey } from '@/lib/chat';
import { useMarkChatRead } from '@/lib/messages';
import { openSafetyMenu } from '@/lib/safety-menu';
import { makeStyles, useColors } from '@/lib/theme';

// One-to-one chat with someone nearby. The first message is a request; the receiver accepts, declines or replies.
export default function DirectChatScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { state, reload } = useDirectChat(userId, myId);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<ChatErrorKey | null>(null);

  const thread = state?.thread ?? null;
  useMarkChatRead('dm', thread?.id, state?.messages.length ?? 0);
  const name = state?.otherName ?? '';
  const incomingRequest = thread?.status === 'pending' && thread.requested_by !== myId;
  const outgoingPending = thread?.status === 'pending' && thread.requested_by === myId;
  const declinedMine = thread?.status === 'declined' && thread.requested_by === myId;

  async function respond(accept: boolean) {
    if (!thread) return;
    setResponding(true);
    const result = await respondToRequest(thread.id, accept);
    setResponding(false);
    if (result) setError(result);
    else if (!accept) router.back();
    else reload();
  }

  let banner = null;
  if (incomingRequest) {
    banner = (
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{t('chat.requestIncoming', { name })}</Text>
        <View style={styles.bannerActions}>
          <View style={styles.flex}>
            <Button title={t('travellers.decline')} variant="secondary" disabled={responding} onPress={() => respond(false)} />
          </View>
          <View style={styles.flex}>
            <Button title={t('travellers.accept')} loading={responding} onPress={() => respond(true)} />
          </View>
        </View>
        {error && <Text style={styles.error}>{t(`chat.errors.${error}`)}</Text>}
      </View>
    );
  } else if (outgoingPending) {
    banner = <Text style={styles.notice}>{t('chat.requestOutgoing', { name })}</Text>;
  } else if (declinedMine) {
    banner = <Text style={styles.notice}>{t('chat.declined', { name })}</Text>;
  } else if (!thread && state) {
    banner = <Text style={styles.notice}>{t('chat.firstMessageHint')}</Text>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={name}
        right={
          myId && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.more')}
              hitSlop={8}
              onPress={() =>
                openSafetyMenu({
                  t,
                  name,
                  myId,
                  otherId: userId,
                  context: 'direct',
                  contextId: thread?.id,
                  onBlocked: () => router.back(),
                })
              }
              style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
              <Icon name="more" size={22} color={Colors.text} />
            </Pressable>
          )
        }
      />
      <ChatView
        messages={state ? state.messages : null}
        myId={myId}
        showNames={false}
        banner={banner}
        // A new chat starts with a text message (that's where the "nearby" check happens); after that the + button
        // works, also for replying to a request.
        chat={thread ? { kind: 'dm', id: thread.id } : null}
        attachHint={t('chat.attachFirstMessage')}
        canSend={!outgoingPending && !declinedMine}
        onSend={async (body) => {
          const result = await sendDirectMessage(userId, body);
          if (!result) reload();
          return result;
        }}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  more: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: Colors.pressed },
  banner: {
    margin: Spacing.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.violetTint,
    borderWidth: 1,
    borderColor: Colors.violet,
  },
  bannerText: { ...Type.body, color: Colors.text },
  bannerActions: { flexDirection: 'row', gap: Spacing.sm },
  notice: {
    ...Type.small,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceRaised,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    textAlign: 'center',
  },
  error: { ...Type.small, color: Colors.danger },
}));
