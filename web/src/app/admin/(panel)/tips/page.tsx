import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { TipButtons } from "./tip-buttons";

export const metadata: Metadata = { title: "Insider tips" };

type Tip = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  display_name: string;
  place_name: string | null;
  open_reports: number;
  helpful: number;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

// Insider tips people leave on places in the app. A tip reported by 3 people is hidden until you keep or delete it.
export default function TipsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Insider tips</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        Short tips people leave on places and partner venues. Whoever reports a tip stops seeing it at once; at 3 open
        reports it is hidden for everyone until you keep it (clears the reports) or delete it.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading…</p>}>
        <Lists />
      </Suspense>
    </div>
  );
}

async function Lists() {
  await connection();
  const supabase = await requireAdmin();
  const [reported, recent] = await Promise.all([
    supabase.rpc("admin_tips", { p_reported_only: true, p_limit: 200 }),
    supabase.rpc("admin_tips", { p_reported_only: false, p_limit: 100 }),
  ]);
  if (reported.error) return <p className="mt-8 text-sm text-red-700">Couldn&apos;t load tips: {reported.error.message}</p>;

  const row = (tip: Tip, isReported: boolean) => (
    <li key={tip.id} className="space-y-2 px-3 py-3 text-sm">
      <p className="text-ink-900">&ldquo;{tip.body}&rdquo;</p>
      <p className="text-ink-500">
        {tip.display_name} on <strong className="text-ink-700">{tip.place_name ?? "a place"}</strong> · {when(tip.created_at)} ·{" "}
        👍 {tip.helpful}
        {tip.open_reports > 0 ? (
          <span className="ml-1 font-semibold text-red-700">
            · {tip.open_reports} open report{tip.open_reports === 1 ? "" : "s"}
          </span>
        ) : null}
      </p>
      <TipButtons tipId={tip.id} reported={isReported} />
    </li>
  );

  const reportedTips = (reported.data ?? []) as Tip[];
  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">Reported ({reportedTips.length})</h2>
      {reportedTips.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">No reported tips.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
          {reportedTips.map((tip) => row(tip, true))}
        </ul>
      )}
      <h2 className="mt-10 text-lg font-semibold">Newest</h2>
      <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
        {((recent.data ?? []) as Tip[]).map((tip) => row(tip, tip.open_reports > 0))}
      </ul>
    </>
  );
}
