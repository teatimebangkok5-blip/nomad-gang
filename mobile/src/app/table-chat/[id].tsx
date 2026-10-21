import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatView } from '@/components/chat-view';
import { ScreenHeader } from '@/components/screen-header';
import { EmojiAvatar } from '@/components/tm-emoji';
import { Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatWhen } from '@/lib/bangkok-time';
import { sendTableMessage, useTableChat } from '@/lib/chat';
import { useMarkChatRead } from '@/lib/messages';
import { useMeetup } from '@/lib/meetups';
import { makeStyles } from '@/lib/theme';
import { EMOJI_BY_ID } from '@/lib/tm-emoji';
import { useVenues } from '@/lib/venues';

// The picture in the header: what kind of place it is.
const VENUE_EMOJI: Record<string, string> = { cafe: 'coffee', bar: 'beer', rooftop: 'cocktail' };

// Group chat for the people who joined a table or hangout. Only members can read or post (enforced by the database),
// also after it ends or is cancelled, until they leave the chat in Messages.
export default function TableChatScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { messages, failed } = useTableChat(id);
  const { state } = useMeetup(id);
  const venues = useVenues();
  const [openedAt] = useState(() => Date.now());

  const meetup = state.status === 'ready' ? state.meetup : null;
  const venue = meetup?.venue_id ? venues.venues.find((v) => v.id === meetup.venue_id) : undefined;
  // Hangouts are named by their title, tables by their place.
  const placeName =
    meetup?.kind === 'hangout'
      ? meetup.title
      : venue
        ? localized(venue, 'name', language)
        : (meetup?.place_name ?? '');
  const chatLabel = meetup?.kind === 'hangout' ? t('hangouts.chat') : t('chat.openChat');
  const isMember = Boolean(meetup?.members.some((m) => m.user_id === myId));
  useMarkChatRead('meetup', isMember ? id : null, messages?.length ?? 0);

  // "4 going · Today 19:30", or that it has ended / was cancelled.
  const subtitle = meetup
    ? [
        t('chat.going', { count: meetup.members.length }),
        meetup.status === 'cancelled'
          ? t('messages.cancelled')
          : new Date(meetup.ends_at).getTime() < openedAt
            ? t('messages.ended')
            : formatWhen(meetup.starts_at, t, undefined, meetup.time_zone),
      ].join(' · ')
    : undefined;
  const emojiId = meetup?.pitstop
    ? 'omw'
    : meetup?.kind === 'hangout'
      ? 'compass'
      : ((venue && VENUE_EMOJI[venue.category]) ?? 'noodles');
  // A partner venue's "15% off" deal, offered first when splitting the bill.
  const dealPercent = venue?.deal ? Number(/(\d{1,2})\s*%/.exec(venue.deal.title_en)?.[1]) || null : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={placeName || chatLabel}
        subtitle={subtitle}
        avatar={<EmojiAvatar emoji={EMOJI_BY_ID.get(emojiId)!} />}
        divider
      />
      <ChatView
        messages={failed && !messages ? [] : messages}
        myId={myId}
        showNames
        canSend={isMember}
        chat={isMember ? { kind: 'meetup', id } : null}
        emptyText={failed ? t('chat.loadFailed') : undefined}
        partnerDiscount={dealPercent}
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
  notice: { ...Type.small, color: Colors.textSecondary, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
}));
