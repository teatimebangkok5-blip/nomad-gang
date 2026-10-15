"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/form";
import { deleteVenue } from "../actions";

export function DeleteVenueButton({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass("danger")}
        onClick={() => {
          if (!window.confirm(`Delete "${venueName}"? Its deal and staff logins are deleted too.`)) return;
          setError(null);
          startTransition(async () => {
            // On success the action redirects to the venue list; it only returns on failure.
            const result = await deleteVenue(venueId);
            setError(result.error ?? null);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete venue"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
