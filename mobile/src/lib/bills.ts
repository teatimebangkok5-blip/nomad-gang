import { useCallback, useEffect, useState } from 'react';

import type { ChatRef } from '@/lib/chat-media';
import { supabase, uniqueChannelName } from '@/lib/supabase';

// Split the bill in a chat (supabase/migrations/*_icebreakers_split_bills.sql). A calculator only: the payer enters
// each person's part (or splits equally), the partner discount, service charge, VAT and tip; the server works out what
// everyone owes and posts the bill in the chat. People tick their share as paid (the payer can tick anyone's).

export type Bill = {
  id: string;
  chat_kind: ChatRef['kind'];
  chat_id: string;
  payer_id: string;
  title: string;
  currency: string;
  discount_pct: number;
  service_pct: number;
  vat_pct: number;
  tip_pct: number;
  subtotal: number;
  total: number;
  created_at: string;
};

export type BillShare = {
  user_id: string;
  subtotal: number;
  amount: number;
  paid_at: string | null;
  display_name: string;
  avatar_path: string | null;
};

export type BillRates = { discount: number; service: number; vat: number; tip: number };

// What one part of the bill becomes: discount first, then service charge, VAT on top ("++" prices), then tip. Rounded
// to 2 decimals like the server.
export function shareAmount(subtotal: number, rates: BillRates): number {
  const factor = (1 - rates.discount / 100) * (1 + rates.service / 100) * (1 + rates.vat / 100) * (1 + rates.tip / 100);
  return Math.round(subtotal * factor * 100) / 100;
}

// Splits a total equally in satang (cents), the first people taking the leftover cents.
export function splitEqually(total: number, people: number): number[] {
  if (people <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / people);
  return Array.from({ length: people }, (_, i) => (base + (i < cents - base * people ? 1 : 0)) / 100);
}

export type ChatMember = { user_id: string; display_name: string; avatar_path: string | null };

// The people in a chat, for picking who shares the bill.
export function useChatMembers(chat: ChatRef | null) {
  const [members, setMembers] = useState<ChatMember[] | null>(null);
  const kind = chat?.kind;
  const id = chat?.id;
  useEffect(() => {
    if (!kind || !id) return;
    type Row = { user_id: string; profiles: { display_name: string; avatar_path: string | null } | null };
    const toMembers = (rows: Row[]) =>
      rows.map((row) => ({
        user_id: row.user_id,
        display_name: row.profiles?.display_name ?? '',
        avatar_path: row.profiles?.avatar_path ?? null,
      }));
    if (kind === 'dm') {
      supabase
        .from('direct_threads')
        .select('user_a, user_b')
        .eq('id', id)
        .maybeSingle()
        .then(async ({ data }) => {
          const ids = data ? [data.user_a as string, data.user_b as string] : [];
          const { data: people } = await supabase.from('profiles').select('id, display_name, avatar_path').in('id', ids);
          setMembers(
            ((people ?? []) as { id: string; display_name: string; avatar_path: string | null }[]).map((p) => ({
              user_id: p.id,
              display_name: p.display_name,
              avatar_path: p.avatar_path,
            })),
          );
        });
      return;
    }
    const query =
      kind === 'meetup'
        ? supabase.from('meetup_members').select('user_id, profiles(display_name, avatar_path)').eq('meetup_id', id)
        : supabase.from('chat_group_members').select('user_id, profiles(display_name, avatar_path)').eq('group_id', id);
    query.then(({ data, error }) => {
      if (error) console.warn('Loading chat members failed', error.message);
      else setMembers(toMembers((data ?? []) as unknown as Row[]));
    });
  }, [kind, id]);
  return members;
}

export async function createBill(input: {
  chat: ChatRef;
  title: string;
  currency: string;
  rates: BillRates;
  shares: { userId: string; subtotal: number }[];
}): Promise<'invalid_bill' | 'not_in_chat' | 'generic' | null> {
  const { error } = await supabase.rpc('create_bill', {
    p_chat_kind: input.chat.kind,
    p_chat_id: input.chat.id,
    p_title: input.title.trim(),
    p_currency: input.currency,
    p_discount_pct: input.rates.discount,
    p_service_pct: input.rates.service,
    p_vat_pct: input.rates.vat,
    p_tip_pct: input.rates.tip,
    p_shares: input.shares.map((share) => ({ user_id: share.userId, subtotal: share.subtotal })),
  });
  if (!error) return null;
  console.warn('Creating the bill failed', error.message);
  return error.message.includes('not_in_chat') ? 'not_in_chat' : error.message.includes('invalid_bill') ? 'invalid_bill' : 'generic';
}

export async function setBillPaid(billId: string, userId: string, paid: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('set_bill_paid', { p_bill_id: billId, p_user_id: userId, p_paid: paid });
  if (error) console.warn('Ticking the bill failed', error.message);
  return !error;
}

// One bill with its shares, live (ticks).
export function useBill(billId: string | null) {
  const [state, setState] = useState<{ bill: Bill; shares: BillShare[] } | null | 'missing'>(null);

  const load = useCallback(() => {
    if (!billId) return;
    Promise.all([
      supabase.from('chat_bills').select('*').eq('id', billId).maybeSingle(),
      supabase
        .from('chat_bill_shares')
        .select('user_id, subtotal, amount, paid_at, profiles(display_name, avatar_path)')
        .eq('bill_id', billId),
    ]).then(([bill, shares]) => {
      if (bill.error || shares.error || !bill.data) {
        setState('missing');
        return;
      }
      type Row = Omit<BillShare, 'display_name' | 'avatar_path'> & {
        profiles: { display_name: string; avatar_path: string | null } | null;
      };
      setState({
        bill: { ...(bill.data as Bill), subtotal: Number(bill.data.subtotal), total: Number(bill.data.total) },
        shares: ((shares.data ?? []) as unknown as Row[])
          .map(({ profiles, ...row }) => ({
            ...row,
            subtotal: Number(row.subtotal),
            amount: Number(row.amount),
            display_name: profiles?.display_name ?? '',
            avatar_path: profiles?.avatar_path ?? null,
          }))
          .sort((a, b) => b.amount - a.amount),
      });
    });
  }, [billId]);

  useEffect(() => {
    if (!billId) return;
    load();
    const channel = supabase
      .channel(uniqueChannelName(`bill-${billId}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_bill_shares', filter: `bill_id=eq.${billId}` }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [billId, load]);

  return { state, reload: load };
}
