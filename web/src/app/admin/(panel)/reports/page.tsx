import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { ReportButtons, type ReportTarget } from "./report-buttons";

export const metadata: Metadata = { title: "Reports" };

type Report = {
  id: string;
  created_at: string;
  context: string;
  context_id: string | null;
  chat_kind: string | null;
  reason: string;
  resolved: boolean;
  excerpt: string | null;
  media_path: string | null;
  reporter_name: string;
  reported_id: string;
  reported_name: string;
  reported_open_reports: number;
  story_caption: string | null;
  story_photo_path: string | null;
  tip_body: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

const chatName: Record<string, string> = { meetup: "table / hangout chat", dm: "private chat", group: "group chat" };
const contextName: Record<string, string> = {
  traveller: "their profile",
  direct: "a private chat",
  table: "a table",
  story: "a story",
  tip: "an insider tip",
};
const reasonName: Record<string, string> = {
  spam: "Spam or scam",
  harassment: "Harassment",
  inappropriate: "Nudity, hate or violence",
};

// Everything people report in the app: messages, stories, tips and people. Apple (Guideline 1.2) expects reports
// of objectionable content to be acted on within 24 hours.
export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        What people report in the app: chat messages (a copy is kept even if it&apos;s unsent), stories, insider tips
        and people. Check this every day; the Terms promise action within 24 hours. Remove what breaks the Terms, delete
        the account for serious or repeated abuse, or close the report if it&apos;s fine. A story or tip with 3 open
        reports is already hidden until you deal with it.
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
  const [open, recent] = await Promise.all([
    supabase.rpc("admin_reports", { p_open_only: true, p_limit: 300 }),
    supabase.rpc("admin_reports", { p_open_only: false, p_limit: 50 }),
  ]);
  if (open.error) return <p className="mt-8 text-sm text-red-700">Couldn&apos;t load reports: {open.error.message}</p>;
  const openReports = (open.data ?? []) as Report[];
  const closed = ((recent.data ?? []) as Report[]).filter((report) => report.resolved);

  // Reported photos (chat photos, story photos): short-lived signed links (10 minutes).
  const chatPhotos = openReports.flatMap((r) => (r.media_path && r.excerpt?.startsWith("[photo]") ? [r.media_path] : []));
  const storyPhotos = openReports.flatMap((r) => (r.story_photo_path ? [r.story_photo_path] : []));
  const [chatSigned, storySigned] = await Promise.all([
    chatPhotos.length ? supabase.storage.from("chat-media").createSignedUrls(chatPhotos, 600) : { data: [] },
    storyPhotos.length ? supabase.storage.from("story-photos").createSignedUrls(storyPhotos, 600) : { data: [] },
  ]);
  const url = new Map(
    [...(chatSigned.data ?? []), ...(storySigned.data ?? [])].flatMap((s) =>
      s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [],
    ),
  );

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">Open ({openReports.length})</h2>
      {openReports.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">Nothing to check.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {openReports.map((report) => {
            const photo = url.get(report.media_path ?? "") ?? url.get(report.story_photo_path ?? "");
            return (
              <li key={report.id} className="space-y-2 rounded-xl border border-ink-200 bg-white p-4 text-sm">
                <p>
                  <strong>{report.reporter_name}</strong> reported <strong>{report.reported_name}</strong>
                  {report.context === "message"
                    ? ` for a message in a ${chatName[report.chat_kind ?? ""] ?? "chat"}`
                    : ` (from ${contextName[report.context] ?? report.context})`}{" "}
                  · <span className="font-semibold text-red-700">{reasonName[report.reason] ?? report.reason}</span> ·{" "}
                  <span className="text-ink-500">{when(report.created_at)}</span>
                </p>
                {report.reported_open_reports > 1 && (
                  <p className="font-semibold text-red-700">
                    {report.reported_name} has {report.reported_open_reports} open reports.
                  </p>
                )}
                <Reported report={report} photo={photo} />
                <ReportButtons
                  reportId={report.id}
                  target={target(report)}
                  personId={report.reported_id}
                  personName={report.reported_name}
                />
              </li>
            );
          })}
        </ul>
      )}
      <h2 className="mt-10 text-lg font-semibold">Recently closed</h2>
      {closed.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
          {closed.map((report) => (
            <li key={report.id} className="px-3 py-2 text-sm text-ink-600">
              {report.reporter_name} → {report.reported_name} · {reasonName[report.reason] ?? report.reason} ·{" "}
              {when(report.created_at)}
              {report.excerpt ? <span className="text-ink-500"> · &ldquo;{report.excerpt}&rdquo;</span> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function target(report: Report): ReportTarget {
  if (report.context === "message" && report.chat_kind && report.context_id) {
    return { type: "message", chatKind: report.chat_kind, messageId: report.context_id };
  }
  if (report.context === "story" && report.context_id && report.story_photo_path) {
    return { type: "story", storyId: report.context_id };
  }
  if (report.context === "tip" && report.context_id && report.tip_body) return { type: "tip", tipId: report.context_id };
  return { type: "person" };
}

// What was reported, as far as it's known.
function Reported({ report, photo }: { report: Report; photo: string | undefined }) {
  const text =
    report.context === "message" ? report.excerpt : report.context === "story" ? report.story_caption : report.tip_body;
  const gone =
    (report.context === "story" && !report.story_photo_path) || (report.context === "tip" && !report.tip_body);
  return (
    <div className="space-y-2">
      {text ? <p className="rounded-lg bg-ink-50 px-3 py-2 text-ink-900">&ldquo;{text}&rdquo;</p> : null}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link
        <img src={photo} alt="Reported photo" className="max-h-64 rounded-lg border border-ink-200" />
      ) : null}
      {report.excerpt?.startsWith("[voice]") ? <p className="text-ink-500">A voice note (not playable here).</p> : null}
      {gone ? <p className="text-ink-500">Already deleted.</p> : null}
      {report.context === "traveller" || report.context === "direct" || report.context === "table" ? (
        <p className="text-ink-500">The person was reported, not a single post. Look at their profile in the app.</p>
      ) : null}
    </div>
  );
}
