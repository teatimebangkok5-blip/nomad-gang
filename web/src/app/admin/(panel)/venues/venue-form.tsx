"use client";

import { useActionState, useRef, useState } from "react";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/form";
import { CATEGORY_LABELS, VENUE_CATEGORIES, type FormState, type Venue } from "@/lib/types";
import { GooglePlaceSearch } from "./google-place-search";

type VenueFormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function VenueForm({ action, venue }: { action: VenueFormAction; venue?: Venue }) {
  const [state, formAction, pending] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [coordinates, setCoordinates] = useState(venue ? `${venue.lat}, ${venue.lng}` : "");
  const [googlePlaceId, setGooglePlaceId] = useState(venue?.google_place_id ?? "");
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const mapsUrl = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(coordinates.trim())
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates.replace(/\s/g, ""))}`
    : null;

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />

      <input type="hidden" name="google_place_id" value={googlePlaceId} />
      <GooglePlaceSearch
        onPick={(place) => {
          setGooglePlaceId(place.id);
          setCoordinates(`${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`);
          if (nameRef.current && !nameRef.current.value) nameRef.current.value = place.name;
          if (addressRef.current && !addressRef.current.value) addressRef.current.value = place.address;
        }}
      />
      {googlePlaceId && (
        <p className="-mt-3 text-xs text-ink-600">
          Linked to a Google Maps place. Tables people create there in the app get this venue&apos;s promotions.{" "}
          <button type="button" className="text-brand-700 underline" onClick={() => setGooglePlaceId("")}>
            Unlink
          </button>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name (English)" name="name_en" errors={errors.name_en}>
          <input ref={nameRef} id="name_en" name="name_en" defaultValue={venue?.name_en} required className={inputClass} />
        </Field>
        <Field label="Name (Thai)" name="name_th" errors={errors.name_th}>
          <input id="name_th" name="name_th" lang="th" defaultValue={venue?.name_th} required className={inputClass} />
        </Field>
      </div>

      <Field label="Category" name="category" errors={errors.category}>
        <select id="category" name="category" defaultValue={venue?.category ?? ""} required className={inputClass}>
          <option value="" disabled>
            Choose…
          </option>
          {VENUE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Description (English)" name="description_en" errors={errors.description_en}>
          <textarea
            id="description_en"
            name="description_en"
            rows={3}
            defaultValue={venue?.description_en}
            className={inputClass}
          />
        </Field>
        <Field label="Description (Thai)" name="description_th" errors={errors.description_th}>
          <textarea
            id="description_th"
            name="description_th"
            lang="th"
            rows={3}
            defaultValue={venue?.description_th}
            className={inputClass}
          />
        </Field>
        <Field label="Address (English)" name="address_en" errors={errors.address_en}>
          <input ref={addressRef} id="address_en" name="address_en" defaultValue={venue?.address_en} className={inputClass} />
        </Field>
        <Field label="Address (Thai)" name="address_th" errors={errors.address_th}>
          <input id="address_th" name="address_th" lang="th" defaultValue={venue?.address_th} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field
          label="Check-in point (coordinates)"
          name="coordinates"
          errors={errors.coordinates}
          hint={
            <>
              In Google Maps, right-click the venue&apos;s entrance and click the numbers to copy them.
              {mapsUrl && (
                <>
                  {" "}
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                    Check on map
                  </a>
                </>
              )}
            </>
          }
        >
          <input
            id="coordinates"
            name="coordinates"
            value={coordinates}
            onChange={(event) => setCoordinates(event.target.value)}
            placeholder="13.7563, 100.5018"
            inputMode="decimal"
            required
            className={inputClass}
          />
        </Field>
        <Field
          label="Check-in distance (m)"
          name="checkin_radius_m"
          errors={errors.checkin_radius_m}
          hint="People must be this close to check in."
        >
          <input
            id="checkin_radius_m"
            name="checkin_radius_m"
            type="number"
            min={10}
            max={500}
            defaultValue={venue?.checkin_radius_m ?? 50}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={venue?.is_active ?? false}
          className="mt-0.5 size-4 accent-brand-600"
        />
        <span className="text-sm">
          <span className="font-medium">Live in the app</span>
          <span className="block text-ink-600">Leave off until the deal and staff login are set up.</span>
        </span>
      </label>

      <SubmitButton pending={pending}>{venue ? "Save venue" : "Create venue"}</SubmitButton>
    </form>
  );
}
