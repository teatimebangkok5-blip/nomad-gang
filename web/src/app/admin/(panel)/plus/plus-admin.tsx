"use client";

import { useState, useTransition } from "react";
import { FormMessage, buttonClass, inputClass } from "@/components/form";
import type { FormState } from "@/lib/types";
import { endPlus, findUsers, grantPlus, type FoundUser } from "./actions";

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium" });
}

// Find a person by name or email, then give them a month or a year of Plus.
export function GrantPlus() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<FoundUser[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  function search(event: React.FormEvent) {
    event.preventDefault();
    startSearch(async () => {
      const result = await findUsers(query);
      setUsers(result.users);
      setSearchError(result.error ?? null);
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-ink-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Give Plus</h2>
      <form onSubmit={search} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="plus-query" className="sr-only">
          Name or email
        </label>
        <input
          id="plus-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or email"
          className={`${inputClass} max-w-sm`}
        />
        <button type="submit" disabled={searching} className={buttonClass("primary")}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>
      {searchError && <p className="mt-2 text-sm text-red-700">{searchError}</p>}
      {users && !searchError && users.length === 0 && <p className="mt-3 text-sm text-ink-500">Nobody found.</p>}
      {users && users.length > 0 && (
        <ul className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200">
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UserRow({ user }: { user: FoundUser }) {
  const [note, setNote] = useState("");
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  const active = user.ends_at && new Date(user.ends_at) > new Date();

  const give = (plan: "monthly" | "yearly") => start(async () => setState(await grantPlus(user.id, plan, note)));

  return (
    <li className="space-y-2 px-3 py-3 text-sm">
      <p>
        <strong>{user.display_name}</strong> <span className="text-ink-500">{user.email ?? ""}</span>
        {active && user.ends_at && (
          <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Plus ({user.plan}) until {formatDay(user.ends_at)}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`note-${user.id}`} className="sr-only">
          Note
        </label>
        <input
          id={`note-${user.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          placeholder="Note (optional), e.g. paid by bank transfer"
          className={`${inputClass} max-w-xs`}
        />
        <button type="button" disabled={busy} className={buttonClass("primary")} onClick={() => give("monthly")}>
          {active ? "Add 1 month" : "Give 1 month"}
        </button>
        <button type="button" disabled={busy} className={buttonClass("secondary")} onClick={() => give("yearly")}>
          {active ? "Add 1 year" : "Give 1 year"}
        </button>
      </div>
      <FormMessage state={state} />
    </li>
  );
}

export function EndPlusButton({ userId, name }: { userId: string; name: string }) {
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className={buttonClass("danger", "px-3 py-1")}
        onClick={() => {
          if (confirm(`End Plus for ${name} now?`)) start(async () => setState(await endPlus(userId)));
        }}
      >
        End now
      </button>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </span>
  );
}
