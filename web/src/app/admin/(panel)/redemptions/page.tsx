import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonClass, inputClass } from "@/components/form";
import { requireAdmin } from "@/lib/auth";
import { LiveRedemptions } from "./live";

export const metadata: Metadata = { title: "Redemptions" };

type Redemption = {
  id: string;
  venue_id: string | null;
  venue_name: string;
  deal_title: string;
  deal_kind: string;
  staff_login: string;
  checked_in_count: number;
  member_names: string[];
  redeemed_at: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function bangkokDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Every coupon scanned by venue staff (QR + correct venue login): live, and filterable by venue and Bangkok date, to
// count visits per venue when settling with owners.
export default function RedemptionsPage({ searchParams }: PageProps<"/admin/redemptions">) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Redemptions</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        A redemption is recorded when venue staff scan a group&apos;s QR code, log in with that venue&apos;s login and
        open the coupon code. Times are Bangkok time.
      </p>
      <LiveRedemptions />
      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading redemptions…</p>}>
        <RedemptionList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function RedemptionList({ searchParams }: { searchParams: PageProps<"/admin/redemptions">["searchParams"] }) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
  const venueFilter = one(params.venue);
  const from = DAY.test(one(params.from)) ? one(params.from) : "";
  const to = DAY.test(one(params.to)) ? one(params.to) : "";

  await connection();
  const supabase = await requireAdmin();

  let query = supabase
    .from("redemptions")
    .select("id, venue_id, venue_name, deal_title, deal_kind, staff_login, checked_in_count, member_names, redeemed_at")
    .order("redeemed_at", { ascending: false })
    .limit(1000);
  if (venueFilter) query = query.eq("venue_id", venueFilter);
  if (from) query = query.gte("redeemed_at", `${from}T00:00:00+07:00`);
  if (to) {
    const end = new Date(`${to}T00:00:00+07:00`);
    end.setUTCDate(end.getUTCDate() + 1);
    query = query.lt("redeemed_at", end.toISOString());
  }

  const [{ data, error }, { data: venues }] = await Promise.all([
    query.returns<Redemption[]>(),
    supabase.from("venues").select("id, name_en").order("name_en").returns<{ id: string; name_en: string }[]>(),
  ]);
  if (error) {
    return <p className="mt-8 text-sm text-red-700">Couldn&apos;t load redemptions: {error.message}</p>;
  }
  const rows = data ?? [];

  const perVenue = new Map<string, { name: string; visits: number; people: number }>();
  for (const row of rows) {
    const key = row.venue_id ?? row.venue_name;
    const entry = perVenue.get(key) ?? { name: row.venue_name, visits: 0, people: 0 };
    entry.visits += 1;
    entry.people += row.checked_in_count;
    perVenue.set(key, entry);
  }

  return (
    <>
      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-800">Venue</span>
          <select name="venue" defaultValue={venueFilter} className={inputClass}>
            <option value="">All venues</option>
            {(venues ?? []).map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name_en}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-800">From</span>
          <input type="date" name="from" defaultValue={from} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-800">To</span>
          <input type="date" name="to" defaultValue={to} className={inputClass} />
        </label>
        <button type="submit" className={buttonClass("primary")}>
          Filter
        </button>
        <Link href="/admin/redemptions" className={buttonClass("secondary")}>
          Clear
        </Link>
      </form>

      <h2 className="mt-8 text-lg font-semibold">Visits per venue</h2>
      {perVenue.size === 0 ? (
        <p className="mt-2 text-sm text-ink-500">No redemptions{venueFilter || from || to ? " for this filter" : " yet"}.</p>
      ) : (
        <table className="mt-2 w-full max-w-xl overflow-hidden rounded-xl border border-ink-200 bg-white text-sm">
          <thead className="bg-ink-50 text-left text-ink-600">
            <tr>
              <th className="px-3 py-2 font-medium">Venue</th>
              <th className="px-3 py-2 text-right font-medium">Redemptions</th>
              <th className="px-3 py-2 text-right font-medium">People checked in</th>
            </tr>
          </thead>
          <tbody>
            {[...perVenue.values()]
              .sort((a, b) => b.visits - a.visits)
              .map((venue) => (
                <tr key={venue.name} className="border-t border-ink-100">
                  <td className="px-3 py-2">{venue.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{venue.visits}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{venue.people}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {rows.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold">History</h2>
          <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink-900">{row.venue_name}</span>
                  <span className="text-ink-500 tabular-nums">{bangkokDateTime(row.redeemed_at)}</span>
                </div>
                <p className="text-ink-700">
                  {row.deal_title} <span className="text-ink-500">({row.deal_kind})</span> · {row.checked_in_count}{" "}
                  checked in · staff login {row.staff_login}
                </p>
                {row.member_names.length > 0 && <p className="text-xs text-ink-500">{row.member_names.join(", ")}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
