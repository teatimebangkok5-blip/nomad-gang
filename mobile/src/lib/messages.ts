import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { MESSAGE_COLUMNS, toMessages, type ChatErrorKey, type ChatMessage, type MessageKind, type MessageRow } from '@/lib/chat';
import { supabase, uniqueChannelName } from '@/lib/supabase';

// Messages (the button next to List on home): one inbox for private chats, group chats and table / hangout chats,
// with unread counts, plus group chats people make themselves. Rules live in the database
// (supabase/migrations/*_messages_and_groups.sql): table / hangout chats stay after they end until the member leaves
// them; "Delete chat" hides a private chat for me until a new message arrives; groups are friends only (mutual
// follows), up to 100 people, any member adds their friends, the owner removes people and renames.

export type ChatKind = 'dm' | 'meetup' | 'group';

export type ChatSummary = {
  chat_kind: ChatKind;
  chat_id: string;
  // Private chat: the other person's name; group: its name; table / hangout: its title (may be empty for tables).
  title: string | null;
  emoji: string | null;
  other_id: string | null;
  other_avatar: string | null;
  dm_status: 'pending' | 'accepted' | 'declined' | null;
  requested_by: string | null;
  meetup_kind: 'table' | 'hangout' | null;
  place_name: string | null;
  place_name_en: string | null;
  place_name_th: string | null;
  venue_name_en: string | null;
  venue_name_th: string | null;
  starts_at: string | null;
  ended: boolean;
  cancelled: boolean;
  member_count: number;
  owner_id: string | null;
  last_body: string | null;
  // Photo, voice note or live location: the inbox names it instead of showing the (empty) body.
  last_kind: MessageKind | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
  last_at: string;
  unread_count: number;
  // My own pin / archive (pinned chats are listed first; archived ones only under Archived).
  pinned: boolean;
  archived: boolean;
};

const GROUP_ERRORS = [
  'auth_required',
  'not_allowed',
  'not_found',
  'name_required',
  'emoji_required',
  'invalid_size',
  'not_friends',
  'group_full',
  'not_owner',
  'meetup_not_ended',
] as const;
export type GroupErrorKey = (typeof GROUP_ERRORS)[number] | 'generic';

function groupError(error: Pick<PostgrestError, 'message'> | null): GroupErrorKey | null {
  if (!error) return null;
  console.warn('Messages request failed', error.message);
  return GROUP_ERRORS.find((key) => error.message.includes(key)) ?? 'generic';
}

// Everything that can change the inbox.
const INBOX_TABLES = [
  'meetup_messages',
  'direct_messages',
  'direct_threads',
  'chat_group_messages',
  'chat_groups',
  'chat_group_members',
  'meetup_members',
] as const;

// The inbox, newest first. Live-updates (a moment after anything changes), when the app returns to the foreground
// and when a chat is marked read.
export function useChats(enabled: boolean) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    supabase.rpc('my_chats').then(({ data, error }) => {
      if (error) {
        console.warn('Loading messages failed', error.message);
        return;
      }
      setChats((data ?? []) as ChatSummary[]);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 600);
    };
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') load();
    });
    let channel = supabase.channel(uniqueChannelName('messages-inbox'));
    for (const table of INBOX_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    }
    channel.subscribe();
    const unsubscribeRead = onChatRead(soon);
    return () => {
      appState.remove();
      unsubscribeRead();
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, load]);

  // The badge: chats with something new (archived chats don't count).
  const unreadChats = (chats ?? []).filter((chat) => chat.unread_count > 0 && !chat.archived).length;
  return { chats, unreadChats, reload: load };
}

// Chat screens tell open inboxes (home badge, Messages list) when they've marked a chat read.
const readListeners = new Set<() => void>();
function onChatRead(listener: () => void) {
  readListeners.add(listener);
  return () => {
    readListeners.delete(listener);
  };
}

export async function markChatRead(kind: ChatKind, chatId: string) {
  const { error } = await supabase.rpc('mark_chat_read', { p_kind: kind, p_chat_id: chatId });
  if (error) console.warn('Marking chat read failed', error.message);
  readListeners.forEach((listener) => listener());
}

// Marks the chat read when it opens, whenever its messages change while it's open, and when it closes.
export function useMarkChatRead(kind: ChatKind, chatId: string | null | undefined, messageCount: number) {
  useEffect(() => {
    if (!chatId) return;
    markChatRead(kind, chatId);
  }, [kind, chatId, messageCount]);
  useEffect(() => {
    if (!chatId) return;
    return () => {
      markChatRead(kind, chatId);
    };
  }, [kind, chatId]);
}

// Pin or archive a chat (for me only).
export async function setChatFlag(kind: ChatKind, chatId: string, what: 'pin' | 'archive', on: boolean) {
  const { error } = await supabase.rpc('set_chat_flag', { p_kind: kind, p_chat_id: chatId, p_what: what, p_on: on });
  if (error) console.warn('Saving chat flag failed', error.message);
  readListeners.forEach((listener) => listener());
  return !error;
}

// Delete a private chat (for me), leave an ended table / hangout chat, or leave a group.
export async function leaveChat(kind: ChatKind, chatId: string): Promise<GroupErrorKey | null> {
  const { error } = await supabase.rpc('leave_chat', { p_kind: kind, p_chat_id: chatId });
  return groupError(error);
}

// ---------------------------------------------------------------------------
// Group chats
// ---------------------------------------------------------------------------

export type Friend = { id: string; display_name: string; avatar_path: string | null };

// People I follow who follow me back (the only people I can add to a group).
export function useFriends() {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  useEffect(() => {
    supabase.rpc('my_friends').then(({ data, error }) => {
      if (error) console.warn('Loading friends failed', error.message);
      setFriends(error ? [] : ((data ?? []) as Friend[]));
    });
  }, []);
  return friends;
}

// Emojis to pick for a group.
export const GROUP_EMOJIS = [
  '🎉', '🍜', '🍻', '☕', '🌴', '✈️', '🏖️', '🏙️', '🎶', '⚽', '🏃', '🧘',
  '🎮', '📸', '🎨', '📚', '💼', '🛍️', '🌙', '🔥', '❤️', '😎', '🙌', '🐘',
];

export async function createGroup(name: string, emoji: string, memberIds: string[]) {
  const { data, error } = await supabase.rpc('create_group_chat', { p_name: name, p_emoji: emoji, p_member_ids: memberIds });
  return { id: (data as string | null) ?? null, error: groupError(error) };
}

export async function addGroupMembers(groupId: string, memberIds: string[]) {
  const { error } = await supabase.rpc('add_group_members', { p_group_id: groupId, p_member_ids: memberIds });
  return groupError(error);
}

export async function removeGroupMember(groupId: string, userId: string) {
  const { error } = await supabase.rpc('remove_group_member', { p_group_id: groupId, p_user_id: userId });
  return groupError(error);
}

export async function renameGroup(groupId: string, name: string, emoji: string) {
  const { error } = await supabase.rpc('rename_group', { p_group_id: groupId, p_name: name, p_emoji: emoji });
  return groupError(error);
}

export type GroupMember = { user_id: string; joined_at: string; display_name: string; avatar_path: string | null };
export type GroupInfo = { id: string; name: string; emoji: string; owner_id: string | null; members: GroupMember[] };

type GroupRow = {
  id: string;
  name: string;
  emoji: string;
  owner_id: string | null;
  chat_group_members: { user_id: string; joined_at: string; profiles: { display_name: string; avatar_path: string | null } | null }[];
};

// One group with its members (null = not found / not a member any more). Live-updates.
export function useGroup(groupId: string) {
  const [group, setGroup] = useState<GroupInfo | null | 'loading'>('loading');

  const load = useCallback(() => {
    supabase
      .from('chat_groups')
      .select('id, name, emoji, owner_id, chat_group_members(user_id, joined_at, profiles(display_name, avatar_path))')
      .eq('id', groupId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Loading group failed', error.message);
        const row = data as GroupRow | null;
        setGroup(
          row
            ? {
                id: row.id,
                name: row.name,
                emoji: row.emoji,
                owner_id: row.owner_id,
                members: row.chat_group_members
                  .map((m) => ({
                    user_id: m.user_id,
                    joined_at: m.joined_at,
                    display_name: m.profiles?.display_name ?? '',
                    avatar_path: m.profiles?.avatar_path ?? null,
                  }))
                  .sort((a, b) => a.joined_at.localeCompare(b.joined_at)),
              }
            : null,
        );
      });
  }, [groupId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(uniqueChannelName(`group-${groupId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_groups', filter: `id=eq.${groupId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_group_members', filter: `group_id=eq.${groupId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  return { group, reload: load };
}

// Group messages newest first (for an inverted list), live (new messages and moving live locations).
export function useGroupChat(groupId: string) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    supabase
      .from('chat_group_messages')
      .select(MESSAGE_COLUMNS)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) console.warn('Loading group chat failed', error.message);
        setFailed(Boolean(error));
        if (!error) {
          setMessages(toMessages((data ?? []) as unknown as MessageRow[]));
        }
      });
  }, [groupId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(uniqueChannelName(`group-chat-${groupId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_group_messages', filter: `group_id=eq.${groupId}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  return { messages, failed, reload: load };
}

export async function sendGroupMessage(groupId: string, senderId: string, body: string): Promise<ChatErrorKey | null> {
  const text = body.trim();
  if (!text) return 'empty_message';
  const { error } = await supabase.from('chat_group_messages').insert({ group_id: groupId, sender_id: senderId, body: text });
  if (!error) return null;
  console.warn('Sending group message failed', error.message);
  return 'generic';
}
