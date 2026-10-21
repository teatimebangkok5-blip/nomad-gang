"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/types";

const genders = ["woman", "man", "other"] as const;

// Approves (with the gender seen on the ID) or rejects (with a reason the person sees in the app), then deletes the
// selfie and the ID photo right away: they are only kept until the decision.
export async function decideVerification(
  requestId: string,
  approve: boolean,
  gender: (typeof genders)[number] | null,
  reason: string,
): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(requestId).success) return { error: "Unknown request" };
  if (approve && (!gender || !genders.includes(gender))) return { error: "Pick the gender shown on the ID" };
  if (!approve && reason.trim().length > 300) return { error: "Keep the reason under 300 characters" };

  const { data, error } = await supabase.rpc("admin_decide_verification", {
    p_request_id: requestId,
    p_approve: approve,
    p_gender: approve ? gender : null,
    p_reason: approve ? null : reason.trim(),
  });
  if (error) {
    if (error.message.includes("not_found")) return { error: "This request was already decided." };
    return { error: `Couldn't save the decision: ${error.message}` };
  }
  const row = ((data ?? []) as { selfie_path: string | null; id_path: string | null }[])[0];
  const paths = [row?.selfie_path, row?.id_path].filter((path): path is string => !!path);
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from("verifications").remove(paths);
    if (removeError) return { error: `Decision saved, but the photos couldn't be deleted: ${removeError.message}` };
  }
  refresh();
  return { ok: true, message: approve ? "Verified. Photos deleted." : "Rejected. Photos deleted." };
}

export async function revokeVerification(userId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(userId).success) return { error: "Unknown person" };
  const { error } = await supabase.rpc("admin_revoke_verification", { p_user_id: userId });
  if (error) return { error: `Couldn't remove the verification: ${error.message}` };
  refresh();
  return { ok: true, message: "Verification removed." };
}
