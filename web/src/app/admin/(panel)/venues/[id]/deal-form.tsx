"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/form";
import type { Deal, DiscountType } from "@/lib/types";
import { saveDeal } from "../actions";

export function DealForm({ venueId, deal, couponCode }: { venueId: string; deal: Deal | null; couponCode: string }) {
  const [state, formAction, pending] = useActionState(saveDeal.bind(null, venueId), {});
  const errors = state.fieldErrors ?? {};
  const [discountType, setDiscountType] = useState<DiscountType>(deal?.discount_type ?? "percent");

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="deal_id" value={deal?.id ?? ""} />

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
        <Field label="Discount type" name="discount_type" errors={errors.discount_type}>
          <select
            id="discount_type"
            name="discount_type"
            value={discountType}
            onChange={(event) => setDiscountType(event.target.value as DiscountType)}
            className={inputClass}
          >
            <option value="percent">Percent off</option>
            <option value="fixed_thb">Baht off</option>
            <option value="other">Other (e.g. free drink)</option>
          </select>
        </Field>
        {discountType !== "other" && (
          <Field
            label={discountType === "percent" ? "Percent off" : "Baht off (฿)"}
            name="discount_value"
            errors={errors.discount_value}
          >
            <input
              id="discount_value"
              name="discount_value"
              type="number"
              min={1}
              max={discountType === "percent" ? 100 : undefined}
              step="any"
              defaultValue={deal?.discount_value ?? ""}
              required
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deal title (English)" name="title_en" errors={errors.title_en} hint='e.g. "15% off the whole bill"'>
          <input id="title_en" name="title_en" defaultValue={deal?.title_en} required className={inputClass} />
        </Field>
        <Field label="Deal title (Thai)" name="title_th" errors={errors.title_th}>
          <input id="title_th" name="title_th" lang="th" defaultValue={deal?.title_th} required className={inputClass} />
        </Field>
        <Field label="Conditions (English)" name="details_en" errors={errors.details_en} hint="Optional, e.g. not valid on alcohol">
          <textarea id="details_en" name="details_en" rows={2} defaultValue={deal?.details_en} className={inputClass} />
        </Field>
        <Field label="Conditions (Thai)" name="details_th" errors={errors.details_th}>
          <textarea
            id="details_th"
            name="details_th"
            lang="th"
            rows={2}
            defaultValue={deal?.details_th}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Coupon code"
        name="coupon_code"
        errors={errors.coupon_code}
        hint="The code the venue owner gave you. Staff see it only after scanning a valid QR and logging in."
      >
        <input
          id="coupon_code"
          name="coupon_code"
          defaultValue={couponCode}
          autoComplete="off"
          required
          className={`${inputClass} font-mono`}
        />
      </Field>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={deal?.is_active ?? true} className="size-4 accent-brand-600" />
        <span className="font-medium">Deal is active</span>
      </label>

      <SubmitButton pending={pending}>{deal ? "Save deal" : "Add deal"}</SubmitButton>
    </form>
  );
}
