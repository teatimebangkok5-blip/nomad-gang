"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormMessage, SubmitButton, buttonClass, inputClass } from "@/components/form";
import { addChallenge, addReward, reviewCompletion, setActive } from "./actions";

export function ReviewButtons({ meetupId }: { meetupId: string }) {
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const review = (approve: boolean) =>
    start(async () => {
      const result = await reviewCompletion(meetupId, approve, note);
      setError(result.error ?? null);
    });

  return (
    <div className="mt-3 space-y-2">
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional, e.g. why it was rejected)"
        maxLength={300}
        className={inputClass}
      />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => review(true)} className={buttonClass("primary")}>
          Approve
        </button>
        <button type="button" disabled={busy} onClick={() => review(false)} className={buttonClass("danger")}>
          Reject
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function ActiveToggle({
  table,
  id,
  active,
}: {
  table: "passport_rewards" | "challenges";
  id: string;
  active: boolean;
}) {
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => start(async () => void (await setActive(table, id, !active)))}
      className={buttonClass("secondary", "px-3 py-1 text-xs")}
    >
      {active ? "Turn off" : "Turn on"}
    </button>
  );
}

export function RewardForm({ venues }: { venues: { id: string; name_en: string }[] }) {
  const [state, action, pending] = useActionState(addReward, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
      <Field label="Unlocks after" name="milestone" errors={errors.milestone}>
        <select id="milestone" name="milestone" defaultValue="3" className={inputClass}>
          <option value="3">3 verified meetups</option>
          <option value="5">5 verified meetups</option>
          <option value="10">10 verified meetups</option>
        </select>
      </Field>
      <Field label="Partner venue (optional)" name="venue_id" errors={errors.venue_id}>
        <select id="venue_id" name="venue_id" defaultValue="" className={inputClass}>
          <option value="">None</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name_en}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title (English)" name="title_en" errors={errors.title_en}>
        <input id="title_en" name="title_en" maxLength={100} required className={inputClass} />
      </Field>
      <Field label="Title (Thai)" name="title_th" errors={errors.title_th}>
        <input id="title_th" name="title_th" maxLength={100} required className={inputClass} />
      </Field>
      <Field label="Details (English)" name="details_en" errors={errors.details_en}>
        <textarea id="details_en" name="details_en" maxLength={500} rows={2} className={inputClass} />
      </Field>
      <Field label="Details (Thai)" name="details_th" errors={errors.details_th}>
        <textarea id="details_th" name="details_th" maxLength={500} rows={2} className={inputClass} />
      </Field>
      <Field label="Coupon code (shown once unlocked)" name="coupon_code" errors={errors.coupon_code}>
        <input id="coupon_code" name="coupon_code" maxLength={60} className={inputClass} />
      </Field>
      <Field label="Link (https, optional)" name="link" errors={errors.link}>
        <input id="link" name="link" type="url" maxLength={500} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending}>Add reward</SubmitButton>
      </div>
    </form>
  );
}

export function ChallengeForm() {
  const [state, action, pending] = useActionState(addChallenge, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormMessage state={state} />
      </div>
      <Field label="Emoji" name="emoji" errors={errors.emoji}>
        <input id="emoji" name="emoji" defaultValue="🏆" maxLength={16} required className={inputClass} />
      </Field>
      <Field label="Bonus points (0–50)" name="points" errors={errors.points}>
        <input id="points" name="points" type="number" min={0} max={50} defaultValue={10} className={inputClass} />
      </Field>
      <Field label="Title (English)" name="title_en" errors={errors.title_en}>
        <input id="title_en" name="title_en" maxLength={80} required className={inputClass} />
      </Field>
      <Field label="Title (Thai)" name="title_th" errors={errors.title_th}>
        <input id="title_th" name="title_th" maxLength={80} required className={inputClass} />
      </Field>
      <Field label="What to do (English)" name="description_en" errors={errors.description_en}>
        <textarea id="description_en" name="description_en" maxLength={300} rows={2} className={inputClass} />
      </Field>
      <Field label="What to do (Thai)" name="description_th" errors={errors.description_th}>
        <textarea id="description_th" name="description_th" maxLength={300} rows={2} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending}>Add challenge</SubmitButton>
      </div>
    </form>
  );
}
