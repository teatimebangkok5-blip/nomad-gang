import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { buttonClass } from "@/components/form";
import { CATEGORY_LABELS, describeDiscount, type Deal, type Venue } from "@/lib/types";

export const metadata: Metadata = { title: "Venues" };

type VenueRow = Pick<Venue, "id" | "name_en" | "name_th" | "category" | "is_active"> & {
  deals: Pick<Deal, "discount_type" | "discount_value" | "title_en" | "is_active">[];
  venue_accounts: { count: number }[];
};

export default function VenuesPage() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Venues</h1>
          <p className="mt-1 text-sm text-ink-600">
            Partner cafes, restaurants, rooftops and bars. Only venues marked <em>Live</em> show in the app.
          </p>
        </div>
        <Link href="/admin/venues/new" className={buttonClass("primary")}>
          Add venue
        </Link>
      </div>

      <Suspense fallback={<VenueListSkeleton />}>
        <VenueList />
      </Suspense>
    </div>
  );
}

async function VenueList() {
  // The Supabase session check reads the current time.
  await connection();
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from("venues")
    .select("id, name_en, name_th, category, is_active, deals(discount_type, discount_value, title_en, is_active), venue_accounts(count)")
    .order("created_at", { ascending: false });

  const venues = (data ?? []) as VenueRow[];

  return (
    <>
      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load venues: {error.message}
        </p>
      )}

      {!error && venues.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
          <p className="font-medium">No venues yet</p>
          <p className="mt-1 text-sm text-ink-600">Add your first partner venue, its deal and a staff login.</p>
          <Link href="/admin/venues/new" className={buttonClass("primary", "mt-4")}>
            Add venue
          </Link>
        </div>
      )}

      {venues.length > 0 && (
        <ul className="mt-6 divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-white">
          {venues.map((venue) => {
            const deal = venue.deals.find((d) => d.is_active);
            const logins = venue.venue_accounts[0]?.count ?? 0;
            const missing = [!deal && "no active deal", logins === 0 && "no staff login"].filter(Boolean);
            return (
              <li key={venue.id}>
                <Link
                  href={`/admin/venues/${venue.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ink-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {venue.name_en} <span className="text-ink-500">· {venue.name_th}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {CATEGORY_LABELS[venue.category]}
                      {deal && <> · {describeDiscount(deal)}</>}
                      {missing.length > 0 && <span className="text-amber-700"> · {missing.join(", ")}</span>}
                    </p>
                  </div>
                  <StatusBadge live={venue.is_active} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function VenueListSkeleton() {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading venues"
      className="mt-6 animate-pulse divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-white"
    >
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="space-y-2">
            <div className="h-4 w-48 rounded bg-ink-200" />
            <div className="h-3 w-32 rounded bg-ink-100" />
          </div>
          <div className="h-5 w-12 rounded-full bg-ink-100" />
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Live</span>
  ) : (
    <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600">Hidden</span>
  );
}
