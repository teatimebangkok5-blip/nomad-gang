import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { supabase, uniqueChannelName } from '@/lib/supabase';

// Table chat (meetup_messages), direct messages (direct_threads / direct_messages), block and report.
// The rules live in the database (supabase/migrations/*_chat_and_travellers.sql).

// 'unsent': the sender took it back (shown as "Message unsent"). 'card': an icebreaker card ('ice:<deck>:<n>') or a
// table / hangout invite ('meetup:<id>'); 'bill': a split bill (body = its id).
export type MessageKind = 'text' | 'photo' | 'voice' | 'location' | 'unsent' | 'card' | 'bill';

export type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  body: string;
  created_at: string;
  kind: MessageKind;
  // Photo / voice note: the file in the private chat-media bucket.
  media_path: string | null;
  duration_ms: number | null;
  // Live location: the latest position and until when it is shared.
  lat: number | null;
  lng: number | null;
  live_until: string | null;
  location_updated_at: string | null;
  // Set when the sender edited the text.
  edited_at: string | null;
};

const CHAT_ERRORS = [
  'auth_required',
  'not_allowed',
  'not_visible',
  'too_far',
  'blocked',
  'empty_message',
  'request_pending',
  'request_declined',
  'not_found',
  'invalid_attachment',
  'too_many_requests',
] as const;
export type ChatErrorKey = (typeof CHAT_ERRORS)[number] | 'generic';

export function chatError(error: Pick<PostgrestError, 'message'> | null): ChatErrorKey | null {
  if (!error) return null;
  console.warn('Chat request failed', error.message);
  return CHAT_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
}

// The columns every chat (table, private, group) selects for its messages.
export const MESSAGE_COLUMNS =
  'id, sender_id, body, created_at, kind, media_path, duration_ms, lat, lng, live_until, location_updated_at, edited_at, profiles(display_name, avatar_path)';

export type MessageRow = Omit<ChatMessage, 'sender_name' | 'sender_avatar'> & {
  profiles: { display_name: string; avatar_path: string | null } | null;
};

export function toMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map(({ profiles, ...row }) => ({
    ...row,
    sender_name: profiles?.display_name ?? '',
    sender_avatar: profiles?.avatar_path ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Table chat
// ---------------------------------------------------------------------------

async function fetchTableMessages(meetupId: string): Promise<ChatMessage[] | null> {
  const { data, error } = await supabase
    .from('meetup_messages')
    .select(MESSAGE_COLUMNS)
    .eq('meetup_id', meetupId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('Loading table chat failed', error.message);
    return null;
  }
  return toMessages(data as unknown as MessageRow[]);
}

// Messages newest first (for an inverted list). Live-updates when anyone in the table posts or a live location moves.
export function useTableChat(meetupId: string) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    () =>
      fetchTableMessages(meetupId).then((rows) => {
        setFailed(rows === null);
        if (rows) setMessages(rows);
      }),
    [meetupId],
  );

  useEffect(() => {
    load();
    const channel = supabase
      .channel(uniqueChannelName(`table-chat-${meetupId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetup_messages', filter: `meetup_id=eq.${meetupId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetupId, load]);

  return { messages, failed, reload: load };
}

export async function sendTableMessage(meetupId: string, senderId: string, body: string): Promise<ChatErrorKey | null> {
  const text = body.trim();
  if (!text) return 'empty_message';
  const { error } = await supabase.from('meetup_messages').insert({ meetup_id: meetupId, sender_id: senderId, body: text });
  return chatError(error);
}

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

export type ThreadStatus = 'pending' | 'accepted' | 'declined';

export type DirectThread = { id: string; status: ThreadStatus; requested_by: string };

async function fetchDirect(otherId: string, myId: string) {
  const [a, b] = myId < otherId ? [myId, otherId] : [otherId, myId];
  const [{ data: thread }, { data: other }] = await Promise.all([
    supabase.from('direct_threads').select('id, status, requested_by').eq('user_a', a).eq('user_b', b).maybeSingle(),
    supabase.from('profiles').select('display_name, avatar_path').eq('id', otherId).maybeSingle(),
  ]);
  let messages: ChatMessage[] = [];
  if (thread) {
    const { data } = await supabase
      .from('direct_messages')
      .select(MESSAGE_COLUMNS)
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(200);
    messages = toMessages((data ?? []) as unknown as MessageRow[]);
  }
  return {
    thread: (thread as DirectThread | null) ?? null,
    otherName: (other as { display_name: string } | null)?.display_name ?? '',
    otherAvatar: (other as { avatar_path: string | null } | null)?.avatar_path ?? null,
    messages,
  };
}

// One conversation with another person (by their user id), whether or not it has started yet.
export function useDirectChat(otherId: string, myId: string | undefined) {
  const [state, setState] = useState<{
    thread: DirectThread | null;
    otherName: string;
    otherAvatar: string | null;
    messages: ChatMessage[];
  } | null>(
    null,
  );

  const load = useCallback(() => {
    if (!myId) return Promise.resolve();
    return fetchDirect(otherId, myId).then(setState);
  }, [otherId, myId]);

  const threadId = state?.thread?.id;
  useEffect(() => {
    load();
    const channel = supabase.channel(uniqueChannelName(`dm-${otherId}`));
    if (threadId) {
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'direct_messages', filter: `thread_id=eq.${threadId}` },
          () => load(),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'direct_threads', filter: `id=eq.${threadId}` },
          () => load(),
        );
    } else {
      // Not started yet: hear about the thread being created by the other person.
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_threads' }, () => load());
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [otherId, threadId, load]);

  return { state, reload: load };
}

export async function sendDirectMessage(toId: string, body: string): Promise<ChatErrorKey | null> {
  const text = body.trim();
  if (!text) return 'empty_message';
  const { error } = await supabase.rpc('send_direct_message', { p_to: toId, p_body: text });
  return chatError(error);
}

export async function respondToRequest(threadId: string, accept: boolean): Promise<ChatErrorKey | null> {
  const { error } = await supabase.rpc('respond_direct_request', { p_thread_id: threadId, p_accept: accept });
  return chatError(error);
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

export async function blockUser(myId: string, otherId: string): Promise<ChatErrorKey | null> {
  const { error } = await supabase.from('blocks').insert({ blocker_id: myId, blocked_id: otherId });
  // Already blocked counts as success.
  return error?.code === '23505' ? null : chatError(error);
}

export async function reportUser(input: {
  myId: string;
  otherId: string;
  context: 'traveller' | 'direct' | 'table' | 'story' | 'tip';
  contextId?: string;
  reason: string;
}): Promise<ChatErrorKey | null> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: input.myId,
    reported_id: input.otherId,
    context: input.context,
    context_id: input.contextId ?? null,
    reason: input.reason,
  });
  return chatError(error);
}
