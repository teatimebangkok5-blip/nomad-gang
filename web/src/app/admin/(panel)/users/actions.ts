"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/types";

export type FoundUser = { id: string; display_name: string; email: string | null };

// People whose name or email contains the text (at least 2 characters).
export async function findUsers(query: string): Promise<{ users: FoundUser[]; error?: string }> {
  const supabase = await requireAdmin();
  const text = query.trim();
  if (text.length < 2) return { users: [], error: "Type at least 2 characters" };
  const { data, error } = await supabase.rpc("admin_find_users", { p_query: text });
  if (error) return { users: [], error: `Couldn't search: ${error.message}` };
  return { users: (data ?? []) as FoundUser[] };
}

// Deletes someone's account like "Delete account" in the app: their files first (chat photos / voice notes, profile,
// gem and story photos), then the account and everything that belongs to it (admin_delete_user).
export async function deleteUser(userId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(userId).success) return { error: "Unknown person" };

  const { data: files, error: filesError } = await supabase.rpc("admin_account_files", { p_user: userId });
  if (filesError) return { error: `Couldn't list their chat files: ${filesError.message}` };
  const chatFiles = ((files ?? []) as { bucket: string; path: string }[]).map((file) => file.path);
  for (let i = 0; i < chatFiles.length; i += 100) {
    const { error } = await supabase.storage.from("chat-media").remove(chatFiles.slice(i, i + 100));
    if (error) return { error: `Couldn't delete their chat files: ${error.message}` };
  }
  for (const bucket of ["profile-photos", "gem-photos", "story-photos"]) {
    const { data: photos, error: listError } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
    if (listError) return { error: `Couldn't list their ${bucket}: ${listError.message}` };
    if (photos?.length) {
      const { error } = await supabase.storage.from(bucket).remove(photos.map((photo) => `${userId}/${photo.name}`));
      if (error) return { error: `Couldn't delete their ${bucket}: ${error.message}` };
    }
  }

  const { error } = await supabase.rpc("admin_delete_user", { p_user: userId });
  if (error) {
    if (error.message.includes("cannot_delete_admin")) return { error: "This is an admin account, so it can't be deleted here." };
    if (error.message.includes("not_found")) return { error: "This account is already deleted." };
    return { error: `Couldn't delete the account: ${error.message}` };
  }
  refresh();
  return { ok: true, message: "Account deleted." };
}
