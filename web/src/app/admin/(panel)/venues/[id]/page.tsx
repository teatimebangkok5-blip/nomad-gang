import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { venuePhotoUrl } from "@/lib/env";
import { generatePassword } from "@/lib/password";
import type { Deal, Venue, VenueAccount } from "@/lib/types";
import { updateVenue } from "../actions";
import { VenueForm } from "../venue-form";
import { DealForm } from "./deal-form";
import { DeleteVenueButton } from "./delete-venue-button";
import { PhotoUpload } from "./photo-upload";
import { VenueLogins } from "./venue-logins";

export const metadata: Metadata = { title: "Edit venue" };

export default function VenuePage({ params }: PageProps<"/admin/venues/[id]">) {
  return (
    <div className="max-w-3xl">
      <Link href="/admin/venues" className="text-sm text-ink-600 hover:text-ink-900">
        ← Venues
      </Link>
      <Suspense fallback={<VenueEditorSkeleton />}>
        <VenueEditor params={params} />
      </Suspense>
    </div>
  );
}

async function VenueEditor({ params }: { params: PageProps<"/admin/venues/[id]">["params"] }) {
  const { id } = await params;
  // The Supabase session check reads the current time.
  await connection();
  const supabase = await requireAdmin();

  const { data: venue } = await supabase.from("venues").select("*").eq("id", id).maybeSingle<Venue>();
  if (!venue) {
    notFound();
  }

  const [{ data: deals }, { data: accounts }] = await Promise.all([
    supabase
      .from("deals")
      .select("*, deal_coupons(coupon_code)")
      .eq("venue_id", id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("venue_accounts").select("*").eq("venue_id", id).order("created_at"),
  ]);

  const dealRow = (deals?.[0] ?? null) as (Deal & { deal_coupons: { coupon_code: string } | null }) | null;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {venue.name_en} <span className="font-normal text-ink-500">· {venue.name_th}</span>
        </h1>
        {venue.is_active ? (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Live</span>
        ) : (
          <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600">Hidden</span>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <Section title="Details">
          <VenueForm action={updateVenue.bind(null, venue.id)} venue={venue} />
        </Section>

        <Section title="Photo">
          <PhotoUpload
            venueId={venue.id}
            photoUrl={venue.photo_path ? venuePhotoUrl(venue.photo_path) : null}
          />
        </Section>

        <Section
          title="Deal"
          description="What TableMeet groups of 3 or more get. The coupon code is shown only to venue staff after they log in."
        >
          <DealForm
            venueId={venue.id}
            deal={dealRow}
            couponCode={dealRow?.deal_coupons?.coupon_code ?? ""}
          />
        </Section>

        <Section
          title="Staff logins"
          description="Venue staff use these to open the coupon after scanning a group's QR code. Each login works only for this venue."
        >
          <VenueLogins
            venueId={venue.id}
            accounts={(accounts ?? []) as VenueAccount[]}
            initialPassword={generatePassword()}
          />
        </Section>

        <Section title="Delete venue" description="Removes the venue, its deal and its staff logins. This can't be undone.">
          <DeleteVenueButton venueId={venue.id} venueName={venue.name_en} />
        </Section>
      </div>
    </>
  );
}

function VenueEditorSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading venue" className="animate-pulse">
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="h-8 w-64 rounded bg-ink-200" />
        <div className="h-5 w-14 rounded-full bg-ink-100" />
      </div>
      <div className="mt-6 space-y-6">
        {["h-96", "h-48", "h-72", "h-56"].map((height) => (
          <div key={height} className={`${height} rounded-xl border border-ink-200 bg-white p-6`}>
            <div className="h-5 w-32 rounded bg-ink-200" />
            <div className="mt-3 h-3 w-2/3 rounded bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
