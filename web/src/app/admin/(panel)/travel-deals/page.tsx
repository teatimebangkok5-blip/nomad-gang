import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { TRAVEL_DEAL_CATEGORY_LABELS, type TravelDeal } from "@/lib/types";
import { TravelDealForm } from "./deal-form";

export const metadata: Metadata = { title: "Travel deals" };

// True once the deal's end date has passed.
function hasEnded(endsAt: string | null): boolean {
  return endsAt !== null && new Date(endsAt).getTime() < Date.now();
}

type DealRow = TravelDeal & { travel_deal_reports: { count: number }[] };

export default function TravelDealsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Travel deals</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        Rewards for hosts: when a table or hangout ends (not cancelled) with at least 4 people, its host unlocks the
        active deals for that city, its country and everywhere (up to 8, city first). Copy public promo codes from the
        brands&apos; official pages and check them before adding. The app also shows &ldquo;Find deals in
        city&rdquo; buttons (Klook, GetYourGuide, Agoda, Booking.com, Google Flights) for every city.
      </p>

      <details className="mt-6 rounded-lg border border-dashed border-ink-300 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add a deal</summary>
        <div className="mt-4">
          <TravelDealForm />
        </div>
      </details>

      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading deals…</p>}>
        <DealList />
      </Suspense>
    </div>
  );
}

async function DealList() {
  // The Supabase session check reads the current time.
  await connection();
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from("travel_deals")
    .select("*, travel_deal_reports(count)")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        Could not load deals: {error.message}
      </p>
    );
  }
  const deals = (data ?? []) as DealRow[];
  if (deals.length === 0) {
    return <p className="mt-8 text-sm text-ink-600">No deals yet. Hosts still get the &ldquo;Find deals&rdquo; buttons.</p>;
  }

  return (
    <div className="mt-8 space-y-6">
      {deals.map((deal) => {
        const expired = hasEnded(deal.ends_at);
        const where =
          deal.scope === "city" ? `${deal.city_name} (${deal.radius_km} km)` : deal.scope === "country" ? deal.country_code : "Everywhere";
        return (
          <section key={deal.id}>
            <h2 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-800">
              {deal.brand}: {deal.title_en}
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                {TRAVEL_DEAL_CATEGORY_LABELS[deal.category]} · {where}
              </span>
              {!deal.is_active && <span className="rounded-full bg-ink-200 px-2 py-0.5 text-xs">Off</span>}
              {expired && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">Expired</span>}
            </h2>
            <TravelDealForm deal={deal} reports={deal.travel_deal_reports[0]?.count ?? 0} />
          </section>
        );
      })}
    </div>
  );
}
