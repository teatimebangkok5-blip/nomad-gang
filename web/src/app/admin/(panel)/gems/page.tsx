import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { supabaseUrl } from "@/lib/env";
import { SuggestionButtons } from "./gem-form";

export const metadata: Metadata = { title: "Hidden Gems" };

type GemListRow = {
  id: string;
  number: number | null;
  name_en: string;
  area_en: string;
  category: string;
  is_published: boolean;
  local_pick: boolean;
  check_note: string | null;
};

type Suggestion = {
  id: string;
  name: string;
  category: string;
  description: string;
  tip: string;
  price: string;
  lat: number;
  lng: number;
  photo_path: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
};

// Hidden Gems: the curated places (drafts are hidden from the app until published) and suggestions from users.
export default function GemsAdminPage() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Hidden Gems</h1>
        <Link href="/admin/gems/new" className="text-sm font-semibold text-brand-700">
          + Add a gem
        </Link>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        Places tourists often miss. Only published gems show in the app. Drafts marked &ldquo;to check&rdquo; need a
        confirmed pin before you publish them.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading…</p>}>
        <GemsAdmin />
      </Suspense>
    </div>
  );
}

async function GemsAdmin() {
  await connection();
  const supabase = await requireAdmin();
  const [{ data: gems }, { data: suggestions }] = await Promise.all([
    supabase
      .from("gems")
      .select("id, number, name_en, area_en, category, is_published, local_pick, check_note")
      .order("number", { nullsFirst: false })
      .order("created_at")
      .returns<GemListRow[]>(),
    supabase
      .from("gem_suggestions")
      .select("id, name, category, description, tip, price, lat, lng, photo_path, created_at, profiles(display_name)")
      .eq("status", "pending")
      .order("created_at")
      .returns<Suggestion[]>(),
  ]);

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">Suggestions from users ({suggestions?.length ?? 0})</h2>
      {!suggestions?.length ? (
        <p className="mt-2 text-sm text-ink-500">No suggestions waiting.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="rounded-xl border border-ink-200 bg-white p-4 text-sm">
              <p className="font-medium text-ink-900">
                {suggestion.name} <span className="text-ink-500">({suggestion.category})</span>
              </p>
              <p className="text-ink-600">
                by {suggestion.profiles?.display_name ?? "?"} ·{" "}
                <a
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${suggestion.lat}&mlon=${suggestion.lng}#map=18/${suggestion.lat}/${suggestion.lng}`}
                >
                  see on the map
                </a>
                {suggestion.price ? ` · ${suggestion.price}` : ""}
              </p>
              {suggestion.description && <p className="mt-1 text-ink-800">{suggestion.description}</p>}
              {suggestion.tip && <p className="mt-1 text-ink-700">Tip: {suggestion.tip}</p>}
              {suggestion.photo_path && (
                // eslint-disable-next-line @next/next/no-img-element -- user photo from Supabase Storage
                <img
                  src={`${supabaseUrl()}/storage/v1/object/public/gem-photos/${suggestion.photo_path}`}
                  alt={`Photo of ${suggestion.name}`}
                  className="mt-2 h-40 rounded-lg object-cover"
                />
              )}
              <SuggestionButtons id={suggestion.id} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-semibold">Gems ({gems?.length ?? 0})</h2>
      <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
        {(gems ?? []).map((gem) => (
          <li key={gem.id}>
            <Link href={`/admin/gems/${gem.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-ink-50">
              <span>
                <span className="text-ink-500">{gem.number ?? "–"}.</span> <strong>{gem.name_en}</strong>{" "}
                <span className="text-ink-500">
                  · {gem.area_en} · {gem.category}
                  {gem.local_pick ? " · ⭐ Local Pick" : ""}
                </span>
              </span>
              {gem.is_published ? (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Live</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                  Draft{gem.check_note ? " · to check" : ""}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
