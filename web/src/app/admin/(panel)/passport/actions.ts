"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/types";

// Rewards Passport admin: review host-code meetups, milestone rewards and group challenges.

export async function reviewCompletion(meetupId: string, approve: boolean, note: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.rpc("admin_review_completion", {
    p_meetup_id: meetupId,
    p_approve: approve,
    p_note: note,
  });
  if (error) {
    return { error: error.message.includes("not_pending") ? "Already reviewed." : `Couldn't save: ${error.message}` };
  }
  refresh();
  return { ok: true };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((value) => value || null);

const rewardSchema = z.object({
  milestone: z.coerce.number().refine((value) => [3, 5, 10].includes(value), "Choose 3, 5 or 10"),
  title_en: z.string().trim().min(1, "Required").max(100, "At most 100 characters"),
  title_th: z.string().trim().min(1, "Required").max(100, "At most 100 characters"),
  details_en: z.string().trim().max(500, "At most 500 characters"),
  details_th: z.string().trim().max(500, "At most 500 characters"),
  venue_id: z
    .string()
    .trim()
    .transform((value) => value || null),
  coupon_code: optionalText(60),
  link: z
    .string()
    .trim()
    .max(500, "Too long")
    .refine((value) => value === "" || /^https:\/\/\S+$/i.test(value), "Paste a link that starts with https://")
    .transform((value) => value || null),
});

export async function addReward(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = rewardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  if (!parsed.data.coupon_code && !parsed.data.link && !parsed.data.details_en) {
    return { fieldErrors: { coupon_code: ["Add a coupon code, a link or details"] } };
  }
  const { error } = await supabase.from("passport_rewards").insert(parsed.data);
  if (error) {
    return { error: `Couldn't save: ${error.message}` };
  }
  refresh();
  return { ok: true, message: "Reward added." };
}

const challengeSchema = z.object({
  emoji: z.string().trim().min(1, "Required").max(16, "One emoji"),
  title_en: z.string().trim().min(1, "Required").max(80, "At most 80 characters"),
  title_th: z.string().trim().min(1, "Required").max(80, "At most 80 characters"),
  description_en: z.string().trim().max(300, "At most 300 characters"),
  description_th: z.string().trim().max(300, "At most 300 characters"),
  points: z.coerce.number().int().min(0, "0–50").max(50, "0–50"),
});

export async function addChallenge(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = challengeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { error } = await supabase.from("challenges").insert({ ...parsed.data, sort: 100 });
  if (error) {
    return { error: `Couldn't save: ${error.message}` };
  }
  refresh();
  return { ok: true, message: "Challenge added." };
}

// Turn a reward or challenge on / off.
export async function setActive(table: "passport_rewards" | "challenges", id: string, active: boolean): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from(table).update({ is_active: active }).eq("id", id);
  if (error) {
    return { error: `Couldn't save: ${error.message}` };
  }
  refresh();
  return { ok: true };
}
