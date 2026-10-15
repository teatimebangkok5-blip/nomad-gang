"use client";

import { useState, useTransition } from "react";
import { FormMessage, buttonClass } from "@/components/form";
import { createClient } from "@/lib/supabase/browser";
import type { FormState } from "@/lib/types";
import { setVenuePhoto } from "../actions";

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Uploads straight from the browser to Supabase Storage (Server Actions have a small body limit),
// then tells the server which file to use.
export function PhotoUpload({ venueId, photoUrl }: { venueId: string; photoUrl: string | null }) {
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    const extension = EXTENSIONS[file.type];
    if (!extension) {
      setState({ error: "Use a JPG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({ error: "The photo must be 5 MB or smaller." });
      return;
    }

    startTransition(async () => {
      const path = `${venueId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await createClient().storage.from("venue-photos").upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
      });
      if (error) {
        setState({ error: `Upload failed: ${error.message}` });
        return;
      }
      setState(await setVenuePhoto(venueId, path));
    });
  }

  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of a Storage URL
        <img src={photoUrl} alt="Venue photo" className="aspect-[4/3] w-full max-w-sm rounded-lg object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full max-w-sm items-center justify-center rounded-lg bg-ink-100 text-sm text-ink-500">
          No photo yet
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className={buttonClass("secondary", pending ? "pointer-events-none opacity-60" : "cursor-pointer")}>
          {pending ? "Uploading…" : photoUrl ? "Replace photo" : "Upload photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
        </label>
        {photoUrl && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("danger")}
            onClick={() => startTransition(async () => setState(await setVenuePhoto(venueId, null)))}
          >
            Remove photo
          </button>
        )}
      </div>
    </div>
  );
}
