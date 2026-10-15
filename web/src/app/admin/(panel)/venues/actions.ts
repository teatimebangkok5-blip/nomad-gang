"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { COUPON_KINDS, DISCOUNT_TYPES, PROMOTION_KINDS, VENUE_CATEGORIES, type FormState } from "@/lib/types";

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
  google_place_id: z
    .string()
    .trim()
    .transform((value) => value || null),
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
    google_place_id: formData.get("google_place_id") ?? "",
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
// Promotions: discount and offer (coupon code), event and party (dated)
// ---------------------------------------------------------------------------

// <input type="datetime-local"> gives "2026-10-20T20:00" with no zone; the admin works in Bangkok time.
function fromBangkokInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const promotionSchema = z
  .object({
    promotion_id: z.uuid().nullable(),
    kind: z.enum(PROMOTION_KINDS),
    title_en: z.string().trim().min(1, "Required"),
    title_th: z.string().trim().min(1, "Required"),
    details_en: z.string().trim(),
    details_th: z.string().trim(),
    discount_type: z.enum(DISCOUNT_TYPES).nullable(),
    discount_value: z.string().trim(),
    coupon_code: z.string().trim().max(60, "Too long"),
    starts_at: z.string().trim(),
    ends_at: z.string().trim(),
    is_active: z.boolean(),
  })
  .transform((data, ctx) => {
    const hasCoupon = COUPON_KINDS.includes(data.kind);
    if (hasCoupon && !data.coupon_code) {
      ctx.addIssue({ code: "custom", path: ["coupon_code"], message: "Required" });
    }

    let discountValue: number | null = null;
    let discountType: (typeof DISCOUNT_TYPES)[number] = "other";
    if (data.kind === "discount") {
      discountType = data.discount_type === "fixed_thb" ? "fixed_thb" : "percent";
      const value = Number(data.discount_value);
      const max = discountType === "percent" ? 100 : 100000;
      if (!data.discount_value || !Number.isFinite(value) || value <= 0 || value > max) {
        ctx.addIssue({
          code: "custom",
          path: ["discount_value"],
          message: discountType === "percent" ? "Enter a percent between 1 and 100" : "Enter an amount in baht",
        });
      }
      discountValue = value;
    }

    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    if (!hasCoupon) {
      startsAt = fromBangkokInput(data.starts_at);
      endsAt = fromBangkokInput(data.ends_at);
      if (!startsAt) ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Pick a start date and time" });
      if (!endsAt) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Pick an end date and time" });
      if (startsAt && endsAt && endsAt <= startsAt) {
        ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Must be after the start" });
      }
    }

    return { ...data, discount_type: discountType, discount_value: discountValue, starts_at: startsAt, ends_at: endsAt };
  });

export async function savePromotion(venueId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = promotionSchema.safeParse({
    promotion_id: formData.get("promotion_id") || null,
    kind: formData.get("kind"),
    title_en: formData.get("title_en") ?? "",
    title_th: formData.get("title_th") ?? "",
    details_en: formData.get("details_en") ?? "",
    details_th: formData.get("details_th") ?? "",
    discount_type: formData.get("discount_type") || null,
    discount_value: formData.get("discount_value") ?? "",
    coupon_code: formData.get("coupon_code") ?? "",
    starts_at: formData.get("starts_at") ?? "",
    ends_at: formData.get("ends_at") ?? "",
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const p = parsed.data;
  const { error } = await supabase.rpc("admin_save_promotion", {
    p_venue_id: venueId,
    p_promotion_id: p.promotion_id,
    p_kind: p.kind,
    p_title_en: p.title_en,
    p_title_th: p.title_th,
    p_details_en: p.details_en,
    p_details_th: p.details_th,
    p_discount_type: p.discount_type,
    p_discount_value: p.discount_value,
    p_coupon_code: p.coupon_code || null,
    p_starts_at: p.starts_at?.toISOString() ?? null,
    p_ends_at: p.ends_at?.toISOString() ?? null,
    p_is_active: p.is_active,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "This place already has an active discount or offer. Turn that one off first: one coupon per place." };
    }
    return { error: `Could not save: ${error.message}` };
  }

  refresh();
  return { ok: true, message: p.promotion_id ? "Saved." : "Added. The app shows it right away." };
}

export async function deletePromotion(promotionId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("deals").delete().eq("id", promotionId);
  if (error) {
    return { error: `Could not delete: ${error.message}` };
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Google place link
// ---------------------------------------------------------------------------

export type GooglePlaceResult = { id: string; name: string; address: string; lat: number; lng: number };

// Search Google Places (New) from the server, biased to Bangkok. Needs GOOGLE_PLACES_API_KEY in web/.env.local.
export async function searchGooglePlaces(query: string): Promise<{ results?: GooglePlaceResult[]; error?: string }> {
  await requireAdmin();
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return { error: "Google search isn't set up yet (GOOGLE_PLACES_API_KEY is missing in web/.env.local)." };
  }
  const text = query.trim();
  if (text.length < 2) return { results: [] };

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: text,
      maxResultCount: 8,
      locationBias: { circle: { center: { latitude: 13.7466, longitude: 100.5393 }, radius: 50000 } },
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    return { error: `Google search failed (${response.status}). Check the Places API key.` };
  }
  const data = (await response.json()) as {
    places?: {
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }[];
  };
  const results = (data.places ?? []).flatMap((place) =>
    place.location
      ? [
          {
            id: place.id,
            name: place.displayName?.text ?? "",
            address: place.formattedAddress ?? "",
            lat: place.location.latitude,
            lng: place.location.longitude,
          },
        ]
      : [],
  );
  return { results };
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
