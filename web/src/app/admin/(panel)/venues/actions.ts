"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DISCOUNT_TYPES, VENUE_CATEGORIES, type FormState } from "@/lib/types";

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

const coordinatesSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    // Accepts "13.7563, 100.5018" as copied from Google Maps (right-click on the map).
    const match = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    const lat = match ? Number(match[1]) : NaN;
    const lng = match ? Number(match[2]) : NaN;
    if (!match || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      ctx.addIssue({ code: "custom", message: 'Paste coordinates like "13.7563, 100.5018"' });
      return z.NEVER;
    }
    return { lat, lng };
  });

const venueSchema = z.object({
  name_en: z.string().trim().min(1, "Required"),
  name_th: z.string().trim().min(1, "Required"),
  category: z.enum(VENUE_CATEGORIES, "Choose a category"),
  description_en: z.string().trim(),
  description_th: z.string().trim(),
  address_en: z.string().trim(),
  address_th: z.string().trim(),
  coordinates: coordinatesSchema,
  checkin_radius_m: z.coerce.number().int().min(10, "At least 10 m").max(500, "At most 500 m"),
  is_active: z.boolean(),
});

function parseVenue(formData: FormData) {
  return venueSchema.safeParse({
    name_en: formData.get("name_en") ?? "",
    name_th: formData.get("name_th") ?? "",
    category: formData.get("category"),
    description_en: formData.get("description_en") ?? "",
    description_th: formData.get("description_th") ?? "",
    address_en: formData.get("address_en") ?? "",
    address_th: formData.get("address_th") ?? "",
    coordinates: formData.get("coordinates") ?? "",
    checkin_radius_m: formData.get("checkin_radius_m") ?? "50",
    is_active: formData.get("is_active") === "on",
  });
}

function toRow(data: z.infer<typeof venueSchema>) {
  const { coordinates, ...rest } = data;
  return { ...rest, lat: coordinates.lat, lng: coordinates.lng };
}

export async function createVenue(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = parseVenue(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { data, error } = await supabase.from("venues").insert(toRow(parsed.data)).select("id").single();
  if (error) {
    return { error: `Could not create venue: ${error.message}` };
  }

  redirect(`/admin/venues/${data.id}`);
}

export async function updateVenue(venueId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = parseVenue(formData);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { error } = await supabase.from("venues").update(toRow(parsed.data)).eq("id", venueId);
  if (error) {
    return { error: `Could not save venue: ${error.message}` };
  }

  refresh();
  return { ok: true, message: "Venue saved. The app shows the change right away." };
}

export async function deleteVenue(venueId: string): Promise<FormState> {
  const supabase = await requireAdmin();

  const { data: venue } = await supabase.from("venues").select("photo_path").eq("id", venueId).single();
  const { error } = await supabase.from("venues").delete().eq("id", venueId);
  if (error) {
    return { error: `Could not delete venue: ${error.message}` };
  }
  if (venue?.photo_path) {
    await supabase.storage.from("venue-photos").remove([venue.photo_path]);
  }

  redirect("/admin/venues");
}

// Called after the browser has uploaded the new photo straight to Storage.
export async function setVenuePhoto(venueId: string, photoPath: string | null): Promise<FormState> {
  const supabase = await requireAdmin();

  if (photoPath !== null && !photoPath.startsWith(`${venueId}/`)) {
    return { error: "Invalid photo path." };
  }

  const { data: venue, error: readError } = await supabase
    .from("venues")
    .select("photo_path")
    .eq("id", venueId)
    .single();
  if (readError) {
    return { error: `Could not find venue: ${readError.message}` };
  }

  const { error } = await supabase.from("venues").update({ photo_path: photoPath }).eq("id", venueId);
  if (error) {
    return { error: `Could not save photo: ${error.message}` };
  }

  if (venue.photo_path && venue.photo_path !== photoPath) {
    await supabase.storage.from("venue-photos").remove([venue.photo_path]);
  }

  refresh();
  return { ok: true, message: photoPath ? "Photo updated." : "Photo removed." };
}

// ---------------------------------------------------------------------------
// Deal + coupon code
// ---------------------------------------------------------------------------

const dealSchema = z
  .object({
    deal_id: z.uuid().nullable(),
    title_en: z.string().trim().min(1, "Required"),
    title_th: z.string().trim().min(1, "Required"),
    details_en: z.string().trim(),
    details_th: z.string().trim(),
    discount_type: z.enum(DISCOUNT_TYPES),
    discount_value: z.string().trim(),
    coupon_code: z.string().trim().min(1, "Required").max(60, "Too long"),
    is_active: z.boolean(),
  })
  .transform((data, ctx) => {
    if (data.discount_type === "other") {
      return { ...data, discount_value: null };
    }
    const value = Number(data.discount_value);
    const max = data.discount_type === "percent" ? 100 : 100000;
    if (!data.discount_value || !Number.isFinite(value) || value <= 0 || value > max) {
      ctx.addIssue({
        code: "custom",
        path: ["discount_value"],
        message: data.discount_type === "percent" ? "Enter a percent between 1 and 100" : "Enter an amount in baht",
      });
      return z.NEVER;
    }
    return { ...data, discount_value: value };
  });

export async function saveDeal(venueId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = dealSchema.safeParse({
    deal_id: formData.get("deal_id") || null,
    title_en: formData.get("title_en") ?? "",
    title_th: formData.get("title_th") ?? "",
    details_en: formData.get("details_en") ?? "",
    details_th: formData.get("details_th") ?? "",
    discount_type: formData.get("discount_type"),
    discount_value: formData.get("discount_value") ?? "",
    coupon_code: formData.get("coupon_code") ?? "",
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const d = parsed.data;
  const { error } = await supabase.rpc("admin_save_deal", {
    p_venue_id: venueId,
    p_deal_id: d.deal_id,
    p_title_en: d.title_en,
    p_title_th: d.title_th,
    p_details_en: d.details_en,
    p_details_th: d.details_th,
    p_discount_type: d.discount_type,
    p_discount_value: d.discount_value,
    p_coupon_code: d.coupon_code,
    p_is_active: d.is_active,
  });
  if (error) {
    return { error: `Could not save deal: ${error.message}` };
  }

  refresh();
  return { ok: true, message: "Deal saved." };
}

// ---------------------------------------------------------------------------
// Venue staff logins
// ---------------------------------------------------------------------------

const loginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, "3–40 characters: letters, numbers, dot, dash or underscore");
const passwordSchema = z.string().min(8, "At least 8 characters");

export async function createVenueLogin(venueId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = z
    .object({ login_id: loginIdSchema, password: passwordSchema })
    .safeParse({ login_id: formData.get("login_id") ?? "", password: formData.get("password") ?? "" });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { error } = await supabase.rpc("admin_create_venue_account", {
    p_venue_id: venueId,
    p_login_id: parsed.data.login_id,
    p_password: parsed.data.password,
  });
  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { login_id: ["This login ID is already taken"] } };
    }
    return { error: `Could not create login: ${error.message}` };
  }

  refresh();
  return {
    ok: true,
    message: `Login "${parsed.data.login_id}" created. Give the venue this ID and password now. The password can't be shown again.`,
  };
}

export async function resetVenuePassword(accountId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = passwordSchema.safeParse(formData.get("password") ?? "");
  if (!parsed.success) {
    return { fieldErrors: { password: parsed.error.issues.map((issue) => issue.message) } };
  }

  const { error } = await supabase.rpc("admin_set_venue_password", {
    p_account_id: accountId,
    p_password: parsed.data,
  });
  if (error) {
    return { error: `Could not reset password: ${error.message}` };
  }

  refresh();
  return { ok: true, message: "Password changed. Give the venue the new password." };
}

export async function setVenueLoginActive(accountId: string, isActive: boolean): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("venue_accounts").update({ is_active: isActive }).eq("id", accountId);
  if (error) {
    return { error: `Could not update login: ${error.message}` };
  }
  refresh();
  return { ok: true };
}
