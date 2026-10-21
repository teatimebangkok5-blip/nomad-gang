import { useCallback, useEffect, useState } from 'react';

import { chatError, type ChatErrorKey } from '@/lib/chat';
import type { ChatRef } from '@/lib/chat-media';
import { supabase, uniqueChannelName } from '@/lib/supabase';

// Reactions to chat messages (chat_reactions, supabase/migrations/*_chat_reactions.sql): one TableMeet emoji id per
// person and message. Readable by whoever can read the message, never across a block; written with
// react_to_message. Taking one back sets emoji to null, so Realtime delivers it as an update.

type ReactionRow = { message_id: string; user_id: string; emoji: string };

// One chip under a message: the emoji, how many people picked it, and whether I'm one of them.
export type ReactionCount = { emoji: string; count: number; mine: boolean };

function countByMessage(rows: ReactionRow[], myId: string | undefined): Map<string, ReactionCount[]> {
  const result = new Map<string, ReactionCount[]>();
  for (const row of rows) {
    const list = result.get(row.message_id) ?? [];
    const chip = list.find((c) => c.emoji === row.emoji);
    if (chip) {
      chip.count += 1;
      chip.mine ||= row.user_id === myId;
    } else {
      list.push({ emoji: row.emoji, count: 1, mine: row.user_id === myId });
    }
    result.set(row.message_id, list);
  }
  // Most picked first; ties keep the order they were first picked in (rows come oldest first).
  for (const list of result.values()) list.sort((a, b) => b.count - a.count);
  return result;
}

// The reactions in one chat (all of its messages), live. `react` sets or (null) takes back my reaction.
export function useChatReactions(chat: ChatRef | null, myId: string | undefined) {
  const [rows, setRows] = useState<ReactionRow[]>([]);
  const kind = chat?.kind;
  const id = chat?.id;

  const load = useCallback(() => {
    if (!kind || !id) return;
    supabase
      .from('chat_reactions')
      .select('message_id, user_id, emoji')
      .eq('chat_kind', kind)
      .eq('chat_id', id)
      .not('emoji', 'is', null)
      .order('updated_at')
      .limit(5000)
      .then(({ data, error }) => {
        if (error) console.warn('Loading reactions failed', error.message);
        else setRows(data as ReactionRow[]);
      });
  }, [kind, id]);

  useEffect(() => {
    if (!kind || !id) return;
    load();
    const channel = supabase
      .channel(uniqueChannelName(`reactions-${id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions', filter: `chat_id=eq.${id}` }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [kind, id, load]);

  const react = useCallback(
    async (messageId: string, emoji: string | null): Promise<ChatErrorKey | null> => {
      if (!kind || !myId) return 'auth_required';
      // Show it right away; the reload after a failure puts back what the server has.
      setRows((previous) => [
        ...previous.filter((row) => !(row.message_id === messageId && row.user_id === myId)),
        ...(emoji ? [{ message_id: messageId, user_id: myId, emoji }] : []),
      ]);
      const { error } = await supabase.rpc('react_to_message', {
        p_chat_kind: kind,
        p_message_id: messageId,
        p_emoji: emoji,
      });
      if (error) load();
      return chatError(error);
    },
    [kind, myId, load],
  );

  return { reactions: countByMessage(rows, myId), react };
}
