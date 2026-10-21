import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatAvatar } from '@/components/chat-avatar';
import { ChatView } from '@/components/chat-view';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { sendGroupMessage, useGroup, useGroupChat, useMarkChatRead } from '@/lib/messages';
import { makeStyles, useColors } from '@/lib/theme';

// A group chat. Only members can read (from when they joined) or post; the people button opens the group's info.
export default function GroupChatScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { group } = useGroup(id);
  const { messages, failed } = useGroupChat(id);
  const info = group === 'loading' ? null : group;
  useMarkChatRead('group', info ? id : null, messages?.length ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={info ? info.name : t('messages.group')}
        subtitle={info ? t('messages.people', { count: info.members.length }) : undefined}
        avatar={info ? <ChatAvatar name={info.name} emoji={info.emoji} size={40} /> : undefined}
        divider
        right={
          info && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('messages.groupInfo')}
              hitSlop={8}
              onPress={() => router.push({ pathname: '/group-info/[id]', params: { id } })}
              style={({ pressed }) => [styles.peopleButton, pressed && styles.pressed]}>
              <GlossyFill />
              <Icon name="group" size={18} color={Colors.accent} />
              <Text style={styles.peopleText}>{info.members.length}</Text>
            </Pressable>
          )
        }
      />
      <ChatView
        messages={failed && !messages ? [] : messages}
        myId={myId}
        showNames
        canSend={Boolean(info)}
        chat={info ? { kind: 'group', id } : null}
        emptyText={group === null ? t('messages.notInGroup') : failed ? t('chat.loadFailed') : undefined}
        onSend={(body) => (myId ? sendGroupMessage(id, myId, body) : Promise.resolve('auth_required'))}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  pressed: { opacity: 0.7 },
  peopleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  peopleText: { ...Type.label, color: Colors.text },
}));
