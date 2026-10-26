"use client";

import { useState, useTransition } from "react";
import { FormMessage, buttonClass } from "@/components/form";
import type { FormState } from "@/lib/types";
import { deleteUser } from "../users/actions";
import { closeReport, removeMessage, removeStory, removeTip } from "./actions";

export type ReportTarget =
  | { type: "message"; chatKind: string; messageId: string }
  | { type: "story"; storyId: string }
  | { type: "tip"; tipId: string }
  | { type: "person" };

const removeLabel = { message: "Remove message", story: "Delete story", tip: "Delete tip" } as const;

// Close the report, remove what was reported, or delete the reported person's account.
export function ReportButtons({
  reportId,
  target,
  personId,
  personName,
}: {
  reportId: string;
  target: ReportTarget;
  personId: string;
  personName: string;
}) {
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  if (state.ok) return <FormMessage state={state} />;

  function remove() {
    if (target.type === "person" || !confirm(`${removeLabel[target.type]} for everyone?`)) return;
    start(async () => {
      if (target.type === "message") setState(await removeMessage(reportId, target.chatKind, target.messageId));
      else if (target.type === "story") setState(await removeStory(reportId, target.storyId));
      else setState(await removeTip(reportId, target.tipId));
    });
  }

  function deleteAccount() {
    const typed = prompt(
      `Delete the account of ${personName}?\n\n` +
        "Their profile, photos, messages and everything else are deleted for good. This can't be undone.\n\n" +
        "Type DELETE to confirm.",
    );
    if (typed?.trim() !== "DELETE") return;
    start(async () => setState(await deleteUser(personId)));
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className={buttonClass("secondary", "px-3 py-1")}
        onClick={() => start(async () => setState(await closeReport(reportId)))}
      >
        Close (no action)
      </button>
      {target.type !== "person" && (
        <button type="button" disabled={busy} className={buttonClass("danger", "px-3 py-1")} onClick={remove}>
          {removeLabel[target.type]}
        </button>
      )}
      <button type="button" disabled={busy} className={buttonClass("danger", "px-3 py-1")} onClick={deleteAccount}>
        Delete {personName}&apos;s account
      </button>
      <FormMessage state={state} />
    </span>
  );
}
