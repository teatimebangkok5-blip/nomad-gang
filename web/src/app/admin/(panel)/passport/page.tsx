import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { ActiveToggle, ChallengeForm, ReviewButtons, RewardForm } from "./forms";

export const metadata: Metadata = { title: "Passport" };

type Completion = {
  meetup_id: string;
  status: string;
  submitted_at: string | null;
  meetups: {
    title: string;
    kind: string;
    starts_at: string;
    spot_name: string | null;
    max_people: number;
    venues: { name_en: string } | null;
    places: { name: string } | null;
    meetup_members: { user_id: string }[];
    meetup_checkins: { user_id: string }[];
    meetup_code_confirmations: { user_id: string; profiles: { display_name: string } | null }[];
  } | null;
};

type Reward = {
  id: string;
  milestone: number;
  title_en: string;
  title_th: string;
  coupon_code: string | null;
  link: string | null;
  is_active: boolean;
  venues: { name_en: string } | null;
};

type Challenge = { id: string; emoji: string; title_en: string; title_th: string; points: number; is_active: boolean };

function bangkok(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Rewards Passport: meetups confirmed with the host's code wait here for the founder (GPS-verified ones count by
// themselves), plus the milestone rewards (3 / 5 / 10 verified meetups) and the group challenges.
export default function PassportAdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Rewards Passport</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-600">
        A meetup counts once it has ended with 4+ members checked in by GPS (automatic), or with the host&apos;s
        6-digit code confirmed by 4+ members and approved here. Members get 10 points, the host 15, plus challenge
        points, and a stamp for the Bangkok district. One meetup per person per day counts.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-500">Loading…</p>}>
        <PassportAdmin />
      </Suspense>
    </div>
  );
}

async function PassportAdmin() {
  await connection();
  const supabase = await requireAdmin();
  const [{ data: pending }, { data: rewards }, { data: challenges }, { data: venues }] = await Promise.all([
    supabase
      .from("meetup_completions")
      .select(
        "meetup_id, status, submitted_at, meetups(title, kind, starts_at, spot_name, max_people, venues(name_en), places(name), " +
          "meetup_members(user_id), meetup_checkins(user_id), meetup_code_confirmations(user_id, profiles(display_name)))",
      )
      .eq("status", "pending")
      .order("submitted_at")
      .returns<Completion[]>(),
    supabase
      .from("passport_rewards")
      .select("id, milestone, title_en, title_th, coupon_code, link, is_active, venues(name_en)")
      .order("milestone")
      .order("created_at")
      .returns<Reward[]>(),
    supabase.from("challenges").select("id, emoji, title_en, title_th, points, is_active").order("sort").returns<Challenge[]>(),
    supabase.from("venues").select("id, name_en").order("name_en").returns<{ id: string; name_en: string }[]>(),
  ]);

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">Waiting for review ({pending?.length ?? 0})</h2>
      {!pending?.length ? (
        <p className="mt-2 text-sm text-ink-500">Nothing to review.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {pending.map((item) => {
            const meetup = item.meetups;
            const place = meetup?.venues?.name_en ?? meetup?.places?.name ?? meetup?.spot_name ?? "—";
            return (
              <li key={item.meetup_id} className="rounded-xl border border-ink-200 bg-white p-4 text-sm">
                <p className="font-medium text-ink-900">
                  {meetup?.kind === "hangout" ? "🙌" : "👥"} {meetup?.title || place}
                </p>
                <p className="text-ink-600">
                  {place} · {meetup ? bangkok(meetup.starts_at) : ""} · {meetup?.meetup_members.length ?? 0} members ·{" "}
                  {meetup?.meetup_checkins.length ?? 0} checked in by GPS
                </p>
                <p className="mt-1 text-ink-700">
                  Confirmed with the code:{" "}
                  {meetup?.meetup_code_confirmations.map((c) => c.profiles?.display_name ?? "?").join(", ")}
                </p>
                <ReviewButtons meetupId={item.meetup_id} />
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-semibold">Milestone rewards</h2>
      <p className="mt-1 text-sm text-ink-600">
        Unlocked after 3, 5 or 10 verified meetups. People see locked rewards (without the code) as a goal.
      </p>
      <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
        {(rewards ?? []).map((reward) => (
          <li key={reward.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className={reward.is_active ? "" : "text-ink-400 line-through"}>
              <strong>{reward.milestone}</strong> · {reward.title_en} · {reward.title_th}
              {reward.venues ? ` · ${reward.venues.name_en}` : ""}
              {reward.coupon_code ? ` · code ${reward.coupon_code}` : ""}
            </span>
            <ActiveToggle table="passport_rewards" id={reward.id} active={reward.is_active} />
          </li>
        ))}
        {!rewards?.length && <li className="px-4 py-3 text-sm text-ink-500">No rewards yet.</li>}
      </ul>
      <details className="mt-3 rounded-lg border border-dashed border-ink-300 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add a reward</summary>
        <div className="mt-4">
          <RewardForm venues={venues ?? []} />
        </div>
      </details>

      <h2 className="mt-10 text-lg font-semibold">Group challenges</h2>
      <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
        {(challenges ?? []).map((challenge) => (
          <li key={challenge.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className={challenge.is_active ? "" : "text-ink-400 line-through"}>
              {challenge.emoji} {challenge.title_en} · {challenge.title_th} · +{challenge.points}
            </span>
            <ActiveToggle table="challenges" id={challenge.id} active={challenge.is_active} />
          </li>
        ))}
      </ul>
      <details className="mt-3 rounded-lg border border-dashed border-ink-300 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add a challenge</summary>
        <div className="mt-4">
          <ChallengeForm />
        </div>
      </details>
    </>
  );
}
