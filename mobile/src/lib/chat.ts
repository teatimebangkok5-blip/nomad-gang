import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase, uniqueChannelName } from '@/lib/supabase';

// Table chat (meetup_messages), direct messages (direct_threads / direct_messages), block and report.
// The rules live in the database (supabase/migrations/*_chat_and_travellers.sql).

export type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
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
] as const;
export type ChatErrorKey = (typeof CHAT_ERRORS)[number] | 'generic';

function chatError(error: Pick<PostgrestError, 'message'> | null): ChatErrorKey | null {
  if (!error) return null;
  console.warn('Chat request failed', error.message);
  return CHAT_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
}

type MessageRow = { id: string; sender_id: string; body: string; created_at: string; profiles: { display_name: string } | null };

function toMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    sender_id: row.sender_id,
    sender_name: row.profiles?.display_name ?? '',
    body: row.body,
    created_at: row.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Table chat
// ---------------------------------------------------------------------------

async function fetchTableMessages(meetupId: string): Promise<ChatMessage[] | null> {
  const { data, error } = await supabase
    .from('meetup_messages')
    .select('id, sender_id, body, created_at, profiles(display_name)')
    .eq('meetup_id', meetupId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('Loading table chat failed', error.message);
    return null;
  }
  return toMessages(data as unknown as MessageRow[]);
}

// Messages newest first (for an inverted list). Live-updates when anyone in the table posts.
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
        { event: 'INSERT', schema: 'public', table: 'meetup_messages', filter: `meetup_id=eq.${meetupId}` },
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

export type ThreadSummary = {
  thread_id: string;
  other_id: string;
  other_name: string;
  status: ThreadStatus;
  requested_by: string;
  last_body: string | null;
  last_sender: string | null;
  last_message_at: string;
};

async function fetchThreads(): Promise<ThreadSummary[] | null> {
  const { data, error } = await supabase.rpc('list_my_threads');
  if (error) {
    console.warn('Loading conversations failed', error.message);
    return null;
  }
  return data as ThreadSummary[];
}

// The inbox. Live-updates on new messages and request changes.
export function useThreads(enabled: boolean) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);

  const load = useCallback(() => fetchThreads().then((rows) => rows && setThreads(rows)), []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    const channel = supabase
      .channel(uniqueChannelName('inbox'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_threads' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => load())
      .subscribe();
    return () => {
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [enabled, load]);

  return { threads, reload: load };
}

export type DirectThread = { id: string; status: ThreadStatus; requested_by: string };

async function fetchDirect(otherId: string, myId: string) {
  const [a, b] = myId < otherId ? [myId, otherId] : [otherId, myId];
  const [{ data: thread }, { data: other }] = await Promise.all([
    supabase.from('direct_threads').select('id, status, requested_by').eq('user_a', a).eq('user_b', b).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', otherId).maybeSingle(),
  ]);
  let messages: ChatMessage[] = [];
  if (thread) {
    const { data } = await supabase
      .from('direct_messages')
      .select('id, sender_id, body, created_at, profiles(display_name)')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(200);
    messages = toMessages((data ?? []) as unknown as MessageRow[]);
  }
  return {
    thread: (thread as DirectThread | null) ?? null,
    otherName: (other as { display_name: string } | null)?.display_name ?? '',
    messages,
  };
}

// One conversation with another person (by their user id), whether or not it has started yet.
export function useDirectChat(otherId: string, myId: string | undefined) {
  const [state, setState] = useState<{ thread: DirectThread | null; otherName: string; messages: ChatMessage[] } | null>(
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
          { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `thread_id=eq.${threadId}` },
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
  context: 'traveller' | 'direct' | 'table';
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
