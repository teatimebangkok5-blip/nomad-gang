"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormMessage, SubmitButton, buttonClass, inputClass } from "@/components/form";
import {
  COUPON_KINDS,
  DATED_KINDS,
  DISCOUNT_KINDS,
  OPTIONALLY_DATED_KINDS,
  PROMOTION_LABELS,
  type Deal,
  type PromotionKind,
} from "@/lib/types";
import { deletePromotion, savePromotion } from "../actions";

// Food & drink venues mostly use the first group, hangout venues (parks, museums, malls, …) the second.
const KIND_GROUPS: { label: string; kinds: PromotionKind[] }[] = [
  { label: "Food & drink", kinds: ["discount", "offer"] },
  { label: "Hangout places", kinds: ["ticket", "free_entry"] },
  { label: "Listings", kinds: ["event", "party"] },
];

export type PromotionRow = Deal & { deal_coupons: { coupon_code: string } | null };

// "2026-10-20T13:00:00Z" → "2026-10-20T20:00" for <input type="datetime-local">, in Bangkok time (UTC+7).
function toBangkokInput(iso: string | null): string {
  if (!iso) return "";
  const local = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function Promotions({
  venueId,
  promotions,
  hangoutVenue,
}: {
  venueId: string;
  promotions: PromotionRow[];
  hangoutVenue: boolean;
}) {
  return (
    <div className="space-y-4">
      {promotions.map((promotion) => (
        <PromotionForm key={promotion.id} venueId={venueId} promotion={promotion} />
      ))}
      <details className="rounded-lg border border-dashed border-ink-300 p-4" open={promotions.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add a promotion</summary>
        <div className="mt-4">
          <PromotionForm venueId={venueId} defaultKind={hangoutVenue ? "ticket" : "discount"} />
        </div>
      </details>
    </div>
  );
}

function PromotionForm({
  venueId,
  promotion,
  defaultKind = "discount",
}: {
  venueId: string;
  promotion?: PromotionRow;
  defaultKind?: PromotionKind;
}) {
  const [state, formAction, pending] = useActionState(savePromotion.bind(null, venueId), {});
  const errors = state.fieldErrors ?? {};
  const [kind, setKind] = useState<PromotionKind>(promotion?.kind ?? defaultKind);
  const [discountType, setDiscountType] = useState(promotion?.discount_type === "fixed_thb" ? "fixed_thb" : "percent");
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const hasCoupon = COUPON_KINDS.includes(kind);
  const hasDiscount = DISCOUNT_KINDS.includes(kind);
  const datesRequired = DATED_KINDS.includes(kind);
  const datesOptional = OPTIONALLY_DATED_KINDS.includes(kind);

  return (
    <form
      action={formAction}
      className={`space-y-4 ${promotion ? "rounded-lg border border-ink-200 p-4" : ""}`}
    >
      <FormMessage state={state} />
      <input type="hidden" name="promotion_id" value={promotion?.id ?? ""} />

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Type" name="kind" errors={errors.kind}>
          <select
            id={`kind-${promotion?.id ?? "new"}`}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as PromotionKind)}
            className={inputClass}
          >
            {KIND_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.kinds.map((option) => (
                  <option key={option} value={option}>
                    {PROMOTION_LABELS[option]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <p className="flex-1 pb-2 text-xs text-ink-500">{kindHelp(kind)}</p>
      </div>

      {hasDiscount && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount" name="discount_type" errors={errors.discount_type}>
            <select
              name="discount_type"
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value)}
              className={inputClass}
            >
              <option value="percent">Percent off</option>
              <option value="fixed_thb">Baht off</option>
            </select>
          </Field>
          <Field
            label={discountType === "percent" ? "Percent off" : "Baht off (฿)"}
            name="discount_value"
            errors={errors.discount_value}
          >
            <input
              name="discount_value"
              type="number"
              min={1}
              max={discountType === "percent" ? 100 : undefined}
              step="any"
              defaultValue={promotion?.discount_value ?? ""}
              required
              className={inputClass}
            />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title (English)" name="title_en" errors={errors.title_en} hint={titleHint(kind)}>
          <input name="title_en" defaultValue={promotion?.title_en} required className={inputClass} />
        </Field>
        <Field label="Title (Thai)" name="title_th" errors={errors.title_th}>
          <input name="title_th" lang="th" defaultValue={promotion?.title_th} required className={inputClass} />
        </Field>
        <Field label="Details (English)" name="details_en" errors={errors.details_en} hint="Optional">
          <textarea name="details_en" rows={2} defaultValue={promotion?.details_en} className={inputClass} />
        </Field>
        <Field label="Details (Thai)" name="details_th" errors={errors.details_th}>
          <textarea name="details_th" lang="th" rows={2} defaultValue={promotion?.details_th} className={inputClass} />
        </Field>
      </div>

      {hasCoupon && (
        <Field
          label="Coupon code"
          name="coupon_code"
          errors={errors.coupon_code}
          hint="From the venue owner. Staff see it only after scanning a valid QR and logging in."
        >
          <input
            name="coupon_code"
            defaultValue={promotion?.deal_coupons?.coupon_code ?? ""}
            autoComplete="off"
            required
            className={`${inputClass} font-mono`}
          />
        </Field>
      )}

      {(datesRequired || datesOptional) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={datesRequired ? "Starts (Bangkok time)" : "Starts (Bangkok time, optional)"}
            name="starts_at"
            errors={errors.starts_at}
            hint={datesOptional ? "Leave both dates empty if it's ongoing. Set both for one event." : undefined}
          >
            <input
              name="starts_at"
              type="datetime-local"
              defaultValue={toBangkokInput(promotion?.starts_at ?? null)}
              required={datesRequired}
              className={inputClass}
            />
          </Field>
          <Field label={datesRequired ? "Ends (Bangkok time)" : "Ends (Bangkok time, optional)"} name="ends_at" errors={errors.ends_at}>
            <input
              name="ends_at"
              type="datetime-local"
              defaultValue={toBangkokInput(promotion?.ends_at ?? null)}
              required={datesRequired}
              className={inputClass}
            />
          </Field>
        </div>
      )}

      {(kind === "ticket" || kind === "event" || kind === "party" || kind === "free_entry") && (
        <Field
          label="Ticket link (optional)"
          name="ticket_url"
          errors={errors.ticket_url}
          hint='Official page to buy tickets for this event or offer. Shows as "Buy tickets" in the app. Must start with https://'
        >
          <input
            name="ticket_url"
            type="url"
            inputMode="url"
            defaultValue={promotion?.ticket_url ?? ""}
            placeholder="https://"
            className={inputClass}
          />
        </Field>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={promotion?.is_active ?? true}
            className="size-4 accent-brand-600"
          />
          <span className="font-medium">Active</span>
        </label>
        <div className="flex gap-2">
          {promotion && (
            <button
              type="button"
              disabled={deleting}
              className={buttonClass("danger")}
              onClick={() => {
                if (!window.confirm(`Delete "${promotion.title_en}"?`)) return;
                startDelete(async () => {
                  const result = await deletePromotion(promotion.id);
                  setDeleteError(result.error ?? null);
                });
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <SubmitButton pending={pending}>{promotion ? "Save" : "Add promotion"}</SubmitButton>
        </div>
      </div>
      {deleteError && <p className="text-sm text-red-700">{deleteError}</p>}
    </form>
  );
}

function titleHint(kind: PromotionKind): string {
  switch (kind) {
    case "discount":
      return 'e.g. "15% off the whole bill"';
    case "offer":
      return 'e.g. "Free welcome drink" or "Buy 1 get 1 cocktails"';
    case "event":
      return 'e.g. "Live jazz night"';
    case "party":
      return 'e.g. "Rooftop DJ party"';
    case "ticket":
      return 'e.g. "20% off entry tickets" or "฿100 off festival tickets"';
    case "free_entry":
      return 'e.g. "Free entry for TableMeet groups"';
  }
}

function kindHelp(kind: PromotionKind): string {
  switch (kind) {
    case "discount":
    case "offer":
      return "Unlocked with the coupon code when 3+ people check in. One active discount or offer per place.";
    case "ticket":
      return "A discount on entry tickets, with a coupon code. Any member of a hangout here can use it (no 3-person rule). Ongoing, or set dates for one event.";
    case "free_entry":
      return "Shows that entry is free for TableMeet users. No coupon code. Ongoing, or set dates for one event.";
    case "event":
    case "party":
      return "A dated listing (no coupon). Shows in the app until it ends.";
  }
}
