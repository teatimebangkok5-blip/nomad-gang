import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { DecideButtons, RevokeButton } from "./verification-buttons";

export const metadata: Metadata = { title: "Verifications" };

type Request = {
  id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  gender: "woman" | "man" | "other";
  selfie_path: string | null;
  id_path: string | null;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  verified_gender: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

// Verification requests from the app: a selfie and a photo of an ID with the gender the person chose. Compare the
// face and check the ID, then approve (Verified badge; women get women-only tables) or reject with a reason. The
// photos are deleted as soon as you decide.
export default function VerificationsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Verifications</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        Check that the selfie shows the same person as the ID, and that the ID looks real and readable. Approve with the
        gender shown on the ID: verified women can create and join women-only tables and hangouts. Reject with a short
        reason they will see in the app. Both photos are deleted right after your decision.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading…</p>}>
        <Requests />
      </Suspense>
    </div>
  );
}

async function Requests() {
  await connection();
  const supabase = await requireAdmin();
  const [pending, approved, rejected] = await Promise.all(
    (["pending", "approved", "rejected"] as const).map((status) =>
      supabase.rpc("admin_verification_requests", { p_status: status }),
    ),
  );
  if (pending.error) return <p className="mt-8 text-sm text-red-700">Couldn&apos;t load requests: {pending.error.message}</p>;
  const waiting = (pending.data ?? []) as Request[];
  const paths = waiting.flatMap((r) => [r.selfie_path, r.id_path]).filter((p): p is string => !!p);
  // Private photos: short-lived signed links (10 minutes).
  const { data: signed } = paths.length
    ? await supabase.storage.from("verifications").createSignedUrls(paths, 600)
    : { data: [] };
  const url = new Map(
    (signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])),
  );

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">Waiting ({waiting.length})</h2>
      {waiting.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">Nothing to check.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {waiting.map((request) => (
            <li key={request.id} className="rounded-xl border border-ink-200 bg-white p-4 text-sm">
              <p>
                <strong>{request.display_name}</strong> <span className="text-ink-500">{request.email ?? ""}</span>
                {" · "}says: <strong>{request.gender}</strong>
                {" · "}
                <span className="text-ink-500">sent {when(request.created_at)}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {[
                  ["Selfie", request.selfie_path],
                  ["ID", request.id_path],
                ].map(([label, path]) =>
                  path && url.get(path) ? (
                    <a key={label} href={url.get(path)} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private photo via a signed link */}
                      <img src={url.get(path)} alt={`${label} of ${request.display_name}`} className="h-64 rounded-lg object-cover" />
                      <span className="mt-1 block text-xs text-ink-500">{label} (opens full size)</span>
                    </a>
                  ) : (
                    <p key={label} className="text-ink-500">
                      {label}: missing
                    </p>
                  ),
                )}
              </div>
              <DecideButtons requestId={request.id} claimed={request.gender} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-semibold">Recently verified</h2>
      <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
        {((approved.data ?? []) as Request[]).slice(0, 50).map((request) => (
          <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              <strong>{request.display_name}</strong> <span className="text-ink-500">{request.email ?? ""}</span> ·{" "}
              {request.verified_gender ?? "not verified any more"} · {request.decided_at ? when(request.decided_at) : ""}
            </span>
            {request.verified_gender && <RevokeButton userId={request.user_id} name={request.display_name} />}
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-semibold">Recently rejected</h2>
      <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
        {((rejected.data ?? []) as Request[]).slice(0, 50).map((request) => (
          <li key={request.id} className="px-3 py-2 text-sm">
            <strong>{request.display_name}</strong> <span className="text-ink-500">{request.email ?? ""}</span> ·{" "}
            {request.reason || "no reason given"} · {request.decided_at ? when(request.decided_at) : ""}
          </li>
        ))}
      </ul>
    </>
  );
}
