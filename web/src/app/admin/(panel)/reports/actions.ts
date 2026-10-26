"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/types";

const chatKind = z.enum(["dm", "meetup", "group"]);

// Closes a report (nothing more to do, or it's been dealt with). Closed reports no longer hide a story or tip.
export async function closeReport(reportId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(reportId).success) return { error: "Unknown report" };
  const { error } = await supabase.from("reports").update({ resolved: true }).eq("id", reportId);
  if (error) return { error: `Couldn't close it: ${error.message}` };
  refresh();
  return { ok: true, message: "Closed." };
}

// Unsends the reported message for everyone and deletes its photo / voice note, then closes the report.
export async function removeMessage(reportId: string, kind: string, messageId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!chatKind.safeParse(kind).success || !z.string().uuid().safeParse(messageId).success) {
    return { error: "Unknown message" };
  }
  const { data: path, error } = await supabase.rpc("admin_remove_message", { p_chat_kind: kind, p_message_id: messageId });
  if (error && !error.message.includes("not_found")) return { error: `Couldn't remove it: ${error.message}` };
  if (typeof path === "string" && path) {
    const { error: fileError } = await supabase.storage.from("chat-media").remove([path]);
    if (fileError) return { error: `Message removed, but its file wasn't: ${fileError.message}` };
  }
  return closeAfter(reportId, error ? "It was already unsent." : "Message removed.");
}

// Deletes the reported story (and its photo), then closes the report.
export async function removeStory(reportId: string, storyId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(storyId).success) return { error: "Unknown story" };
  const { data: path, error } = await supabase.rpc("delete_story", { p_story_id: storyId });
  if (error && !error.message.includes("not_found")) return { error: `Couldn't delete it: ${error.message}` };
  if (typeof path === "string" && path) {
    const { error: fileError } = await supabase.storage.from("story-photos").remove([path]);
    if (fileError) return { error: `Story deleted, but its photo wasn't: ${fileError.message}` };
  }
  return closeAfter(reportId, error ? "It was already deleted." : "Story deleted.");
}

// Deletes the reported tip, then closes the report.
export async function removeTip(reportId: string, tipId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  if (!z.string().uuid().safeParse(tipId).success) return { error: "Unknown tip" };
  const { error } = await supabase.rpc("delete_tip", { p_tip_id: tipId });
  if (error && !error.message.includes("not_found")) return { error: `Couldn't delete it: ${error.message}` };
  return closeAfter(reportId, error ? "It was already deleted." : "Tip deleted.");
}

async function closeAfter(reportId: string, message: string): Promise<FormState> {
  const closed = await closeReport(reportId);
  return closed.error ? { error: `${message} ${closed.error}` } : { ok: true, message };
}
