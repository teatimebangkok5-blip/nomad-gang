"use client";

import { useState, useTransition } from "react";
import { FormMessage, buttonClass } from "@/components/form";
import type { FormState } from "@/lib/types";
import { deleteTip, keepTip } from "./actions";

export function TipButtons({ tipId, reported }: { tipId: string; reported: boolean }) {
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  if (state.ok) return <FormMessage state={state} />;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {reported && (
        <button
          type="button"
          disabled={busy}
          className={buttonClass("secondary", "px-3 py-1")}
          onClick={() => start(async () => setState(await keepTip(tipId)))}
        >
          Keep (clear reports)
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        className={buttonClass("danger", "px-3 py-1")}
        onClick={() => {
          if (confirm("Delete this tip for everyone?")) start(async () => setState(await deleteTip(tipId)));
        }}
      >
        Delete
      </button>
      <FormMessage state={state} />
    </span>
  );
}
