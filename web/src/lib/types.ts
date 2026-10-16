// Row shapes for the tables in supabase/migrations. Replace with generated types
// (`npx supabase gen types typescript`) once the project is linked to Supabase.

// Food and drink venues host tables (food map). Hangout venues host hangouts (Hangout map in the app).
export const DINING_CATEGORIES = ["cafe", "restaurant", "rooftop", "bar"] as const;
export const HANGOUT_CATEGORIES = ["attraction", "park", "mall", "museum", "temple", "market", "entertainment"] as const;
export const VENUE_CATEGORIES = [...DINING_CATEGORIES, ...HANGOUT_CATEGORIES] as const;
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export function isHangoutCategory(category: VenueCategory): boolean {
  return (HANGOUT_CATEGORIES as readonly string[]).includes(category);
}

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  rooftop: "Rooftop",
  bar: "Bar",
  attraction: "Attraction",
  park: "Park",
  mall: "Mall",
  museum: "Museum",
  temple: "Temple",
  market: "Market",
  entertainment: "Fun & games (cinema, bowling, …)",
};

export const VENUE_ENTRIES = ["ticket", "free", "free_thai"] as const;
export type VenueEntry = (typeof VENUE_ENTRIES)[number];
export const ENTRY_LABELS: Record<VenueEntry, string> = {
  ticket: "Needs an entry ticket (or pay to play)",
  free: "Free entry",
  free_thai: "Free for Thai citizens, foreigners pay",
};

export const PROMOTION_KINDS = ["discount", "offer", "event", "party", "ticket", "free_entry"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_LABELS: Record<PromotionKind, string> = {
  discount: "Discount",
  offer: "Offer",
  event: "Event",
  party: "Party",
  ticket: "Ticket discount",
  free_entry: "Free entry",
};

// Discount and offer use the coupon code (unlocked when 3+ people check in). A ticket discount also uses a coupon
// code, but any member of a hangout there can use it. Events, parties and free entry are listings without a code.
export const COUPON_KINDS: readonly PromotionKind[] = ["discount", "offer", "ticket"];
// Have a percent / baht amount.
export const DISCOUNT_KINDS: readonly PromotionKind[] = ["discount", "ticket"];
// Dates: required for events and parties, optional for ticket discounts and free entry, none for discount/offer.
export const DATED_KINDS: readonly PromotionKind[] = ["event", "party"];
export const OPTIONALLY_DATED_KINDS: readonly PromotionKind[] = ["ticket", "free_entry"];

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
  place_id: string | null;
  // Official ticket page (https), shown in the app as "Buy tickets".
  ticket_url: string | null;
  // Tickets / Free entry buttons in the app. Null = use the linked map place's entry.
  entry: VenueEntry | null;
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
  // Official ticket page for this event / ticket discount (https).
  ticket_url: string | null;
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
