"use client";

import { useState, useTransition } from "react";
import { FormMessage, buttonClass, inputClass } from "@/components/form";
import type { FormState } from "@/lib/types";
import { deleteUser, findUsers, type FoundUser } from "./actions";

// Find a person by name or email, then delete their account.
export function UserSearch() {
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
      <h2 className="text-lg font-semibold">Find a person</h2>
      <form onSubmit={search} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="user-query" className="sr-only">
          Name or email
        </label>
        <input
          id="user-query"
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
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  const deleted = Boolean(state.ok);

  function remove() {
    const typed = prompt(
      `Delete the account of ${user.display_name} (${user.email ?? "no email"})?\n\n` +
        "Their profile, photos, messages, trips and everything else are deleted for good. This can't be undone.\n\n" +
        "Type DELETE to confirm.",
    );
    if (typed?.trim() !== "DELETE") return;
    start(async () => setState(await deleteUser(user.id)));
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
      <span className={deleted ? "text-ink-400 line-through" : undefined}>
        <strong>{user.display_name}</strong> <span className="text-ink-500">{user.email ?? ""}</span>
      </span>
      <span className="inline-flex flex-wrap items-center gap-2">
        {!deleted && (
          <button type="button" disabled={busy} className={buttonClass("danger", "px-3 py-1")} onClick={remove}>
            {busy ? "Deleting…" : "Delete account"}
          </button>
        )}
        <FormMessage state={state} />
      </span>
    </li>
  );
}
