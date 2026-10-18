"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormMessage, SubmitButton, buttonClass, inputClass } from "@/components/form";
import { acceptSuggestion, deleteGem, rejectSuggestion, saveGem } from "./actions";

export type GemRow = {
  id: string;
  number: number | null;
  area_en: string;
  area_th: string;
  category: string;
  name_en: string;
  name_th: string;
  subtitle_en: string;
  subtitle_th: string;
  description_en: string;
  description_th: string;
  budget_en: string;
  budget_th: string;
  min_spend: number;
  hours_en: string;
  hours_th: string;
  tip_en: string;
  tip_th: string;
  activity_en: string;
  activity_th: string;
  lat: number;
  lng: number;
  local_pick: boolean;
  is_published: boolean;
  check_note: string | null;
};

const CATEGORIES = ["food", "cafes", "culture", "markets", "nightlife", "outdoor", "group"];

// English and Thai side by side for each text.
const PAIRS: { key: string; label: string; max: number; rows?: number }[] = [
  { key: "name", label: "Name", max: 120 },
  { key: "area", label: "Area", max: 60 },
  { key: "subtitle", label: "Short label (e.g. Heritage & cafés)", max: 80 },
  { key: "description", label: "Description", max: 600, rows: 3 },
  { key: "budget", label: "Budget text", max: 160 },
  { key: "hours", label: "Hours / best time", max: 200 },
  { key: "tip", label: "Local tip", max: 400, rows: 2 },
  { key: "activity", label: "TableMeet activity (becomes the hangout title)", max: 80 },
];

export function GemForm({ gem }: { gem?: GemRow }) {
  const [state, action, pending] = useActionState(saveGem, {});
  const errors = state.fieldErrors ?? {};
  const [busy, start] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const value = (key: string) => (gem ? String((gem as Record<string, unknown>)[key] ?? "") : "");

  return (
    <form action={action} className="space-y-5 rounded-xl border border-ink-200 bg-white p-5">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={gem?.id ?? ""} />
      {gem?.check_note && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">To check: {gem.check_note}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category" name="category" errors={errors.category}>
          <select id="category" name="category" defaultValue={gem?.category ?? "food"} className={inputClass}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starting spend per person (฿, 0 = free)" name="min_spend" errors={errors.min_spend}>
          <input id="min_spend" name="min_spend" type="number" min={0} defaultValue={gem?.min_spend ?? 0} className={inputClass} />
        </Field>
        <Field label="Order (number)" name="number" errors={errors.number}>
          <input id="number" name="number" type="number" min={0} defaultValue={gem?.number ?? ""} className={inputClass} />
        </Field>
      </div>
      {PAIRS.map((pair) => (
        <div key={pair.key} className="grid gap-4 sm:grid-cols-2">
          {(["en", "th"] as const).map((language) => {
            const name = `${pair.key}_${language}`;
            const label = `${pair.label} (${language === "en" ? "English" : "Thai"})`;
            return (
              <Field key={name} label={label} name={name} errors={errors[name]}>
                {pair.rows ? (
                  <textarea id={name} name={name} rows={pair.rows} maxLength={pair.max} defaultValue={value(name)} className={inputClass} />
                ) : (
                  <input id={name} name={name} maxLength={pair.max} defaultValue={value(name)} className={inputClass} />
                )}
              </Field>
            );
          })}
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Latitude" name="lat" errors={errors.lat} hint="Right-click the spot in Google Maps / OpenStreetMap to copy it.">
          <input id="lat" name="lat" type="number" step="any" required defaultValue={gem?.lat ?? ""} className={inputClass} />
        </Field>
        <Field label="Longitude" name="lng" errors={errors.lng}>
          <input id="lng" name="lng" type="number" step="any" required defaultValue={gem?.lng ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Note to yourself (what to check)" name="check_note" errors={errors.check_note}>
        <input id="check_note" name="check_note" maxLength={300} defaultValue={gem?.check_note ?? ""} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="local_pick" defaultChecked={gem?.local_pick ?? false} /> ⭐ Local Pick label
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_published" defaultChecked={gem?.is_published ?? false} /> Published (shown in the app)
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{gem ? "Save gem" : "Add gem"}</SubmitButton>
        {gem && (
          <button
            type="button"
            disabled={busy}
            className={buttonClass("danger")}
            onClick={() => {
              if (!confirm("Delete this gem for good?")) return;
              start(async () => setDeleteError((await deleteGem(gem.id)).error ?? null));
            }}
          >
            Delete
          </button>
        )}
        {deleteError && <span className="text-sm text-red-700">{deleteError}</span>}
      </div>
    </form>
  );
}

export function SuggestionButtons({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className={buttonClass("primary")}
        onClick={() => start(async () => setError((await acceptSuggestion(id)).error ?? null))}
      >
        Accept as a draft gem
      </button>
      <button
        type="button"
        disabled={busy}
        className={buttonClass("secondary")}
        onClick={() => start(async () => setError((await rejectSuggestion(id)).error ?? null))}
      >
        Reject
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </div>
  );
}
