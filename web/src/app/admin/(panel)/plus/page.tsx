import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { EndPlusButton, GrantPlus } from "./plus-admin";

export const metadata: Metadata = { title: "TableMeet Plus" };

type PlusRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  plan: "monthly" | "yearly";
  starts_at: string;
  ends_at: string;
  note: string | null;
  active: boolean;
};

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
}

// TableMeet Plus: give people a month or a year by hand (until Google Play payments are added), and see who has it.
// Plus unlocks Plan my day, Hidden Gems and the Passport in the app, and hides the ads.
export default function PlusAdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">TableMeet Plus</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        Plus unlocks Plan my day, Hidden Gems and the Rewards Passport in the app, and hides the ads. Payments aren&rsquo;t
        built yet: when someone pays you, find them here and give them a month or a year. Giving more while they still
        have Plus adds it after their current end date. You always have Plus as the founder.
      </p>
      <GrantPlus />
      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading…</p>}>
        <Members />
      </Suspense>
    </div>
  );
}

async function Members() {
  await connection();
  const supabase = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_plus");
  if (error) return <p className="mt-8 text-sm text-red-700">Couldn&rsquo;t load members: {error.message}</p>;
  const rows = (data ?? []) as PlusRow[];
  const active = rows.filter((row) => row.active);
  const ended = rows.filter((row) => !row.active);

  return (
    <>
      <h2 className="mt-10 text-lg font-semibold">Active members ({active.length})</h2>
      {active.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">No Plus members yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
          {active.map((row) => (
            <li key={row.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>
                <strong>{row.display_name}</strong> <span className="text-ink-500">{row.email ?? ""}</span>
                <span className="block text-ink-600">
                  {row.plan === "yearly" ? "Yearly" : "Monthly"} · since {formatDay(row.starts_at)} · until{" "}
                  {formatDay(row.ends_at)}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
              </span>
              <EndPlusButton userId={row.user_id} name={row.display_name} />
            </li>
          ))}
        </ul>
      )}
      {ended.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold">Ended ({ended.length})</h2>
          <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
            {ended.map((row) => (
              <li key={row.user_id} className="px-4 py-3 text-sm">
                <strong>{row.display_name}</strong> <span className="text-ink-500">{row.email ?? ""}</span>
                <span className="block text-ink-600">
                  Ended {formatDay(row.ends_at)}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
