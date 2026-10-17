"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormMessage, SubmitButton, buttonClass, inputClass } from "@/components/form";
import {
  TRAVEL_DEAL_CATEGORIES,
  TRAVEL_DEAL_CATEGORY_LABELS,
  type TravelDeal,
  type TravelDealScope,
} from "@/lib/types";
import { clearTravelDealReports, deleteTravelDeal, saveTravelDeal } from "./actions";

// "2026-11-30T16:59:59Z" → "2026-11-30" (the day in Bangkok) for <input type="date">.
function toBangkokDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function TravelDealForm({ deal, reports = 0 }: { deal?: TravelDeal; reports?: number }) {
  const [state, formAction, pending] = useActionState(saveTravelDeal, {});
  const errors = state.fieldErrors ?? {};
  const [scope, setScope] = useState<TravelDealScope>(deal?.scope ?? "city");
  const [busy, startAction] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <form action={formAction} className={`space-y-4 ${deal ? "rounded-lg border border-ink-200 bg-white p-4" : ""}`}>
      <FormMessage state={state} />
      <input type="hidden" name="deal_id" value={deal?.id ?? ""} />

      {reports > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            Reported as not working by {reports} {reports === 1 ? "host" : "hosts"}
            {reports >= 3 ? ": hidden in the app until you clear the reports." : "."}
          </span>
          <button
            type="button"
            disabled={busy}
            className={buttonClass("secondary")}
            onClick={() =>
              deal &&
              startAction(async () => {
                const result = await clearTravelDealReports(deal.id);
                setActionError(result.error ?? null);
              })
            }
          >
            It works: clear reports
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand" name="brand" errors={errors.brand} hint="e.g. Klook, Agoda, AirAsia">
          <input name="brand" defaultValue={deal?.brand} required className={inputClass} />
        </Field>
        <Field label="Category" name="category" errors={errors.category}>
          <select name="category" defaultValue={deal?.category ?? "activity"} className={inputClass}>
            {TRAVEL_DEAL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {TRAVEL_DEAL_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title (English)" name="title_en" errors={errors.title_en} hint='e.g. "10% off river cruises"'>
          <input name="title_en" defaultValue={deal?.title_en} required className={inputClass} />
        </Field>
        <Field label="Title (Thai)" name="title_th" errors={errors.title_th}>
          <input name="title_th" lang="th" defaultValue={deal?.title_th} required className={inputClass} />
        </Field>
        <Field label="Details (English)" name="details_en" errors={errors.details_en} hint="Optional: conditions, minimum spend, …">
          <textarea name="details_en" rows={2} defaultValue={deal?.details_en} className={inputClass} />
        </Field>
        <Field label="Details (Thai)" name="details_th" errors={errors.details_th}>
          <textarea name="details_th" lang="th" rows={2} defaultValue={deal?.details_th} className={inputClass} />
        </Field>
        <Field label="Coupon code" name="code" errors={errors.code} hint="Leave empty if the deal works through the link only">
          <input name="code" defaultValue={deal?.code ?? ""} autoComplete="off" className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Deal link" name="url" errors={errors.url} hint="The official deal page (https://). Later this can be your affiliate link.">
          <input name="url" type="url" inputMode="url" defaultValue={deal?.url ?? ""} placeholder="https://" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Where it applies" name="scope" errors={errors.scope}>
          <select
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as TravelDealScope)}
            className={inputClass}
          >
            <option value="city">One city</option>
            <option value="country">A whole country</option>
            <option value="world">Everywhere</option>
          </select>
        </Field>
        {scope === "city" && (
          <>
            <Field
              label="City"
              name="city_name"
              errors={errors.city_name}
              hint={deal?.lat != null ? `On the map at ${deal.lat.toFixed(3)}, ${deal.lng?.toFixed(3)}` : "Found on the map when you save"}
            >
              <input name="city_name" defaultValue={deal?.city_name ?? ""} placeholder="e.g. Paris" className={inputClass} />
            </Field>
            <Field label="Distance (km)" name="radius_km" errors={errors.radius_km} hint="Hangouts this close to the city get it">
              <input name="radius_km" type="number" min={1} max={500} defaultValue={deal?.radius_km ?? 50} className={inputClass} />
            </Field>
          </>
        )}
        {scope === "country" && (
          <Field label="Country code" name="country_code" errors={errors.country_code} hint="Two letters: TH, FR, JP, US, …">
            <input
              name="country_code"
              defaultValue={deal?.country_code ?? ""}
              maxLength={2}
              placeholder="TH"
              className={`${inputClass} uppercase`}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts (optional)" name="starts_at" errors={errors.starts_at}>
          <input name="starts_at" type="date" defaultValue={toBangkokDate(deal?.starts_at ?? null)} className={inputClass} />
        </Field>
        <Field label="Expires (optional)" name="ends_at" errors={errors.ends_at} hint="Hidden in the app after this day (Bangkok time)">
          <input name="ends_at" type="date" defaultValue={toBangkokDate(deal?.ends_at ?? null)} className={inputClass} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={deal?.is_active ?? true} className="size-4 accent-brand-600" />
          <span className="font-medium">Active</span>
        </label>
        <div className="flex gap-2">
          {deal && (
            <button
              type="button"
              disabled={busy}
              className={buttonClass("danger")}
              onClick={() => {
                if (!window.confirm(`Delete "${deal.title_en}"?`)) return;
                startAction(async () => {
                  const result = await deleteTravelDeal(deal.id);
                  setActionError(result.error ?? null);
                });
              }}
            >
              Delete
            </button>
          )}
          <SubmitButton pending={pending}>{deal ? "Save" : "Add deal"}</SubmitButton>
        </div>
      </div>
      {actionError && <p className="text-sm text-red-700">{actionError}</p>}
    </form>
  );
}
