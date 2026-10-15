import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createVenue } from "../actions";
import { VenueForm } from "../venue-form";

export const metadata: Metadata = { title: "Add venue" };

export default async function NewVenuePage() {
  await requireAdmin();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/venues" className="text-sm text-ink-600 hover:text-ink-900">
        ← Venues
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Add venue</h1>
      <p className="mt-1 text-sm text-ink-600">
        After creating the venue you can add its photo, deal and staff login.
      </p>
      <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
        <VenueForm action={createVenue} />
      </div>
    </div>
  );
}
