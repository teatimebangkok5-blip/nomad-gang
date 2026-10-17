import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatView } from '@/components/chat-view';
import { ScreenHeader } from '@/components/screen-header';
import { Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { sendTableMessage, useTableChat } from '@/lib/chat';
import { useMarkChatRead } from '@/lib/messages';
import { useMeetup } from '@/lib/meetups';
import { makeStyles } from '@/lib/theme';
import { useVenues } from '@/lib/venues';

// Group chat for the people who joined a table or hangout. Only members can read or post (enforced by the database),
// also after it ends or is cancelled, until they leave the chat in Messages.
export default function TableChatScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { messages, failed } = useTableChat(id);
  const { state } = useMeetup(id);
  const venues = useVenues();

  const meetup = state.status === 'ready' ? state.meetup : null;
  const venue = meetup?.venue_id ? venues.venues.find((v) => v.id === meetup.venue_id) : undefined;
  // Hangouts are named by their title, tables by their place.
  const placeName =
    meetup?.kind === 'hangout'
      ? meetup.title
      : venue
        ? localized(venue, 'name', currentLanguage())
        : (meetup?.place_name ?? '');
  const chatLabel = meetup?.kind === 'hangout' ? t('hangouts.chat') : t('chat.openChat');
  const isMember = Boolean(meetup?.members.some((m) => m.user_id === myId));
  useMarkChatRead('meetup', isMember ? id : null, messages?.length ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={placeName ? `${chatLabel} · ${placeName}` : chatLabel} />
      <ChatView
        messages={failed && !messages ? [] : messages}
        myId={myId}
        showNames
        canSend={isMember}
        chat={isMember ? { kind: 'meetup', id } : null}
        emptyText={failed ? t('chat.loadFailed') : undefined}
        banner={
          meetup && !isMember ? <Text style={styles.notice}>{t('tables.errors.not_allowed')}</Text> : undefined
        }
        onSend={(body) => (myId ? sendTableMessage(id, myId, body) : Promise.resolve('auth_required'))}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  notice: { ...Type.small, color: Colors.textSecondary, paddingHorizontal: Spacing.lg },
}));
