"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/types";

export async function deleteTip(tipId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(tipId).success) return { error: "Unknown tip" };
  const { error } = await supabase.rpc("delete_tip", { p_tip_id: tipId });
  if (error && !error.message.includes("not_found")) return { error: `Couldn't delete it: ${error.message}` };
  refresh();
  return { ok: true, message: "Deleted." };
}

// The tip is fine: its reports are closed and it shows again for everyone.
export async function keepTip(tipId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(tipId).success) return { error: "Unknown tip" };
  const { error } = await supabase.rpc("admin_clear_tip_reports", { p_tip_id: tipId });
  if (error) return { error: `Couldn't clear the reports: ${error.message}` };
  refresh();
  return { ok: true, message: "Kept; reports cleared." };
}
