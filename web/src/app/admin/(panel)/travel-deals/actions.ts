"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { TRAVEL_DEAL_CATEGORIES, TRAVEL_DEAL_SCOPES, type FormState } from "@/lib/types";

// "2026-11-30" (a day in Bangkok) → the start or the end of that day, Bangkok time (UTC+7).
const dateSchema = (edge: "start" | "end") =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Pick a date")
    .transform((value) => (value ? new Date(`${value}T${edge === "start" ? "00:00:00" : "23:59:59"}+07:00`) : null));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((value) => value || null);

const dealSchema = z
  .object({
    deal_id: z.string().uuid().nullable(),
    brand: z.string().trim().min(1, "Required").max(60, "At most 60 characters"),
    category: z.enum(TRAVEL_DEAL_CATEGORIES, "Choose a category"),
    title_en: z.string().trim().min(1, "Required").max(120, "At most 120 characters"),
    title_th: z.string().trim().min(1, "Required").max(120, "At most 120 characters"),
    details_en: z.string().trim().max(500, "At most 500 characters"),
    details_th: z.string().trim().max(500, "At most 500 characters"),
    code: optionalText(60),
    url: z
      .string()
      .trim()
      .max(500, "Too long")
      .refine((value) => value === "" || /^https:\/\/\S+$/i.test(value), "Paste a link that starts with https://")
      .transform((value) => value || null),
    scope: z.enum(TRAVEL_DEAL_SCOPES, "Choose where it applies"),
    city_name: optionalText(80),
    radius_km: z.coerce.number().int().min(1, "At least 1 km").max(500, "At most 500 km"),
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), "Two letters, e.g. TH, FR, JP")
      .transform((value) => value || null),
    starts_at: dateSchema("start"),
    ends_at: dateSchema("end"),
    is_active: z.boolean(),
  })
  .superRefine((deal, ctx) => {
    if (!deal.code && !deal.url) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "Add a coupon code, a link, or both" });
    }
    if (deal.scope === "city" && !deal.city_name) {
      ctx.addIssue({ code: "custom", path: ["city_name"], message: "Which city?" });
    }
    if (deal.scope === "country" && !deal.country_code) {
      ctx.addIssue({ code: "custom", path: ["country_code"], message: "Which country?" });
    }
    if (deal.starts_at && deal.ends_at && deal.ends_at <= deal.starts_at) {
      ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Must be after the start" });
    }
  });

// Finds a city's center with Photon (free OpenStreetMap search, no key).
async function findCity(name: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const params = new URLSearchParams({ q: name, limit: "1", lang: "en" });
  params.append("osm_tag", "place:city");
  params.append("osm_tag", "place:town");
  params.append("osm_tag", "place:village");
  params.append("osm_tag", "place:municipality");
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      features?: { geometry: { coordinates: [number, number] }; properties: { name?: string; state?: string; country?: string } }[];
    };
    const found = body.features?.[0];
    if (!found) return null;
    const [lng, lat] = found.geometry.coordinates;
    const { name: placeName, state, country } = found.properties;
    return { lat, lng, label: [placeName, state, country].filter(Boolean).join(", ") };
  } catch {
    return null;
  }
}

export async function saveTravelDeal(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await requireAdmin();
  const parsed = dealSchema.safeParse({
    deal_id: formData.get("deal_id") || null,
    brand: formData.get("brand") ?? "",
    category: formData.get("category"),
    title_en: formData.get("title_en") ?? "",
    title_th: formData.get("title_th") ?? "",
    details_en: formData.get("details_en") ?? "",
    details_th: formData.get("details_th") ?? "",
    code: formData.get("code") ?? "",
    url: formData.get("url") ?? "",
    scope: formData.get("scope"),
    city_name: formData.get("city_name") ?? "",
    radius_km: formData.get("radius_km") || 50,
    country_code: formData.get("country_code") ?? "",
    starts_at: formData.get("starts_at") ?? "",
    ends_at: formData.get("ends_at") ?? "",
    is_active: formData.get("is_active") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const d = parsed.data;

  let point: { lat: number; lng: number } | null = null;
  let found = "";
  if (d.scope === "city" && d.city_name) {
    const city = await findCity(d.city_name);
    if (!city) {
      return { error: "Couldn't find that city on the map.", fieldErrors: { city_name: ["Check the spelling, e.g. Paris, Chiang Mai"] } };
    }
    point = city;
    found = ` City found: ${city.label}.`;
  }

  const row = {
    brand: d.brand,
    category: d.category,
    title_en: d.title_en,
    title_th: d.title_th,
    details_en: d.details_en,
    details_th: d.details_th,
    code: d.code,
    url: d.url,
    scope: d.scope,
    city_name: d.scope === "city" ? d.city_name : null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    radius_km: d.radius_km,
    country_code: d.scope === "country" ? d.country_code : null,
    starts_at: d.starts_at?.toISOString() ?? null,
    ends_at: d.ends_at?.toISOString() ?? null,
    is_active: d.is_active,
  };
  const { error } = d.deal_id
    ? await supabase.from("travel_deals").update(row).eq("id", d.deal_id)
    : await supabase.from("travel_deals").insert(row);
  if (error) {
    return { error: `Could not save: ${error.message}` };
  }

  refresh();
  return { ok: true, message: (d.deal_id ? "Saved." : "Added. Hosts who qualify see it right away.") + found };
}

export async function deleteTravelDeal(dealId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("travel_deals").delete().eq("id", dealId);
  if (error) {
    return { error: `Could not delete: ${error.message}` };
  }
  refresh();
  return { ok: true };
}

// After checking a reported deal still works, clear its reports so it shows again.
export async function clearTravelDealReports(dealId: string): Promise<FormState> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("travel_deal_reports").delete().eq("deal_id", dealId);
  if (error) {
    return { error: `Could not clear reports: ${error.message}` };
  }
  refresh();
  return { ok: true };
}
