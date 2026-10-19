"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/types";

export type FoundUser = {
  id: string;
  display_name: string;
  email: string | null;
  plan: "monthly" | "yearly" | null;
  ends_at: string | null;
};

// People whose name or email contains the text (at least 2 characters).
export async function findUsers(query: string): Promise<{ users: FoundUser[]; error?: string }> {
  const supabase = await requireAdmin();
  const text = query.trim();
  if (text.length < 2) return { users: [], error: "Type at least 2 characters" };
  const { data, error } = await supabase.rpc("admin_find_users", { p_query: text });
  if (error) return { users: [], error: `Couldn't search: ${error.message}` };
  return { users: (data ?? []) as FoundUser[] };
}

const grantSchema = z.object({
  userId: z.string().uuid(),
  plan: z.enum(["monthly", "yearly"]),
  note: z.string().trim().max(300, "At most 300 characters"),
});

// Gives Plus for a month or a year (added after the current end if they still have it).
export async function grantPlus(userId: string, plan: string, note: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = grantSchema.safeParse({ userId, plan, note });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const { data, error } = await supabase.rpc("admin_grant_plus", {
    p_user: parsed.data.userId,
    p_plan: parsed.data.plan,
    p_note: parsed.data.note,
  });
  if (error) return { error: `Couldn't give Plus: ${error.message}` };
  refresh();
  const ends = new Date(data as string).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
  return { ok: true, message: `Plus is active until ${ends}.` };
}

export async function endPlus(userId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(userId).success) return { error: "Unknown person" };
  const { error } = await supabase.rpc("admin_end_plus", { p_user: userId });
  if (error) return { error: `Couldn't end Plus: ${error.message}` };
  refresh();
  return { ok: true, message: "Plus ended." };
}
