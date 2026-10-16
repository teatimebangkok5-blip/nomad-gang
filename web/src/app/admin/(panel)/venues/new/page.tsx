import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createVenue } from "../actions";
import { VenueForm } from "../venue-form";

export const metadata: Metadata = { title: "Add venue" };

// /admin/venues/new?for=hangout adds a hangout venue (park, museum, mall, …) instead of a food and drink venue.
export default function NewVenuePage({ searchParams }: PageProps<"/admin/venues/new">) {
  return (
    <div className="max-w-3xl">
      <Link href="/admin/venues" className="text-sm text-ink-600 hover:text-ink-900">
        ← Venues
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Add venue</h1>
      <p className="mt-1 text-sm text-ink-600">
        After creating the venue you can add its photo, promotions and staff login.
      </p>
      <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
        <Suspense fallback={<VenueFormSkeleton />}>
          <NewVenueForm searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function NewVenueForm({ searchParams }: { searchParams: PageProps<"/admin/venues/new">["searchParams"] }) {
  const hangout = (await searchParams).for === "hangout";
  // The Supabase session check reads the current time.
  await connection();
  await requireAdmin();
  return (
    <>
      {hangout && (
        <p className="mb-6 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
          Hangout venue: a place to spend time (attraction, park, mall, museum, temple, market, cinema, bowling, …). It
          shows on the app&apos;s Hangout map, where people create hangouts. Add ticket discounts, free entry and events
          after creating it.
        </p>
      )}
      <VenueForm action={createVenue} hangout={hangout} />
    </>
  );
}

function VenueFormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading form" className="animate-pulse space-y-5">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="space-y-2">
          <div className="h-4 w-32 rounded bg-ink-200" />
          <div className="h-10 rounded-lg bg-ink-100" />
        </div>
      ))}
    </div>
  );
}
