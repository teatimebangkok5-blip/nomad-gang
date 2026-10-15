// Row shapes for the tables in supabase/migrations. Replace with generated types
// (`npx supabase gen types typescript`) once the project is linked to Supabase.

export const VENUE_CATEGORIES = ["cafe", "restaurant", "rooftop", "bar"] as const;
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  rooftop: "Rooftop",
  bar: "Bar",
};

export const PROMOTION_KINDS = ["discount", "offer", "event", "party"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_LABELS: Record<PromotionKind, string> = {
  discount: "Discount",
  offer: "Offer",
  event: "Event",
  party: "Party",
};

// Discount and offer use the coupon code (unlocked when 3+ people check in); events and parties are dated listings.
export const COUPON_KINDS: readonly PromotionKind[] = ["discount", "offer"];

export const DISCOUNT_TYPES = ["percent", "fixed_thb", "other"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export type Venue = {
  id: string;
  name_en: string;
  name_th: string;
  category: VenueCategory;
  description_en: string;
  description_th: string;
  address_en: string;
  address_th: string;
  lat: number;
  lng: number;
  checkin_radius_m: number;
  photo_path: string | null;
  google_place_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Deal = {
  id: string;
  venue_id: string;
  kind: PromotionKind;
  starts_at: string | null;
  ends_at: string | null;
  title_en: string;
  title_th: string;
  details_en: string;
  details_th: string;
  discount_type: DiscountType;
  discount_value: number | null;
  is_active: boolean;
};

export type VenueAccount = {
  id: string;
  venue_id: string;
  login_id: string;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
};

// Returned by every admin form action and shown by the form.
export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function describeDiscount(deal: Pick<Deal, "discount_type" | "discount_value" | "title_en">): string {
  if (deal.discount_type === "percent") return `${deal.discount_value}% off`;
  if (deal.discount_type === "fixed_thb") return `฿${deal.discount_value} off`;
  return deal.title_en;
}
