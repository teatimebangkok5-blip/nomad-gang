"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/types";

// Hidden Gems admin: edit / publish gems and review suggestions from users.

const GEM_CATEGORIES = ["food", "cafes", "culture", "markets", "nightlife", "outdoor", "group"] as const;

const text = (max: number, required = false) =>
  required
    ? z.string().trim().min(1, "Required").max(max, `At most ${max} characters`)
    : z.string().trim().max(max, `At most ${max} characters`);

const gemSchema = z.object({
  id: z.string().trim(),
  number: z
    .string()
    .trim()
    .transform((value) => (value ? Number(value) : null))
    .refine((value) => value === null || (Number.isInteger(value) && value >= 0), "A whole number"),
  area_en: text(60, true),
  area_th: text(60, true),
  category: z.enum(GEM_CATEGORIES, "Choose a category"),
  name_en: text(120, true),
  name_th: text(120, true),
  subtitle_en: text(80),
  subtitle_th: text(80),
  description_en: text(600),
  description_th: text(600),
  budget_en: text(160),
  budget_th: text(160),
  min_spend: z.coerce.number().int("A whole number").min(0, "0 or more").max(100000, "Too high"),
  hours_en: text(200),
  hours_th: text(200),
  tip_en: text(400),
  tip_th: text(400),
  activity_en: text(80),
  activity_th: text(80),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  local_pick: z.boolean(),
  is_published: z.boolean(),
  check_note: z
    .string()
    .trim()
    .max(300)
    .transform((value) => value || null),
});

export async function saveGem(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = gemSchema.safeParse({
    ...Object.fromEntries(formData),
    local_pick: formData.get("local_pick") === "on",
    is_published: formData.get("is_published") === "on",
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { id, ...gem } = parsed.data;
  if (id) {
    const { error } = await supabase.from("gems").update(gem).eq("id", id);
    if (error) return { error: `Couldn't save: ${error.message}` };
    refresh();
    return { ok: true, message: "Saved." };
  }
  const { data, error } = await supabase.from("gems").insert(gem).select("id").single();
  if (error) return { error: `Couldn't save: ${error.message}` };
  redirect(`/admin/gems/${data.id}`);
}

export async function deleteGem(id: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("gems").delete().eq("id", id);
  if (error) return { error: `Couldn't delete: ${error.message}` };
  redirect("/admin/gems");
}

export async function acceptSuggestion(id: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_accept_gem_suggestion", { p_suggestion_id: id });
  if (error) return { error: `Couldn't accept: ${error.message}` };
  redirect(`/admin/gems/${data}`);
}

export async function rejectSuggestion(id: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("gem_suggestions").update({ status: "rejected" }).eq("id", id).eq("status", "pending");
  if (error) return { error: `Couldn't save: ${error.message}` };
  refresh();
  return { ok: true };
}
