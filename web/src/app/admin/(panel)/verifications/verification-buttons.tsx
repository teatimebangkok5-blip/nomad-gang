"use client";

import { useState, useTransition } from "react";
import { FormMessage, buttonClass, inputClass } from "@/components/form";
import type { FormState } from "@/lib/types";
import { decideVerification, revokeVerification } from "./actions";

// Approve as the gender on the ID (the person's own answer is preselected), or reject with a reason.
export function DecideButtons({ requestId, claimed }: { requestId: string; claimed: "woman" | "man" | "other" }) {
  const [gender, setGender] = useState(claimed);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  const done = Boolean(state.ok);

  if (done) return <FormMessage state={state} />;
  return (
    <div className="mt-3 space-y-3">
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="sr-only">Gender on the ID</legend>
        <span className="font-medium text-ink-700">Gender on the ID:</span>
        {(["woman", "man", "other"] as const).map((option) => (
          <label key={option} className="inline-flex items-center gap-1">
            <input type="radio" name={`gender-${requestId}`} checked={gender === option} onChange={() => setGender(option)} />
            {option}
          </label>
        ))}
        <button
          type="button"
          disabled={busy}
          className={buttonClass("primary", "px-3 py-1")}
          onClick={() => start(async () => setState(await decideVerification(requestId, true, gender, "")))}
        >
          {busy ? "Saving…" : "Approve"}
        </button>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`reason-${requestId}`} className="sr-only">
          Reason for rejecting
        </label>
        <input
          id={`reason-${requestId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
          placeholder="Reason (shown to them), e.g. The selfie is too dark"
          className={`${inputClass} max-w-md`}
        />
        <button
          type="button"
          disabled={busy}
          className={buttonClass("danger", "px-3 py-1")}
          onClick={() => start(async () => setState(await decideVerification(requestId, false, null, reason)))}
        >
          Reject
        </button>
      </div>
      <FormMessage state={state} />
    </div>
  );
}

export function RevokeButton({ userId, name }: { userId: string; name: string }) {
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  if (state.ok) return <FormMessage state={state} />;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className={buttonClass("danger", "px-3 py-1")}
        onClick={() => {
          if (confirm(`Remove ${name}'s verification? They lose the badge and women-only access.`)) {
            start(async () => setState(await revokeVerification(userId)));
          }
        }}
      >
        {busy ? "Removing…" : "Remove verification"}
      </button>
      <FormMessage state={state} />
    </span>
  );
}
