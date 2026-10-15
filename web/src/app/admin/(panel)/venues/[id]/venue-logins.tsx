"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormMessage, SubmitButton, buttonClass, inputClass } from "@/components/form";
import type { VenueAccount } from "@/lib/types";
import { generatePassword } from "@/lib/password";
import { createVenueLogin, resetVenuePassword, setVenueLoginActive } from "../actions";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

export function VenueLogins({
  venueId,
  accounts,
  initialPassword,
}: {
  venueId: string;
  accounts: VenueAccount[];
  // Generated on the server so the first render matches between server and browser.
  initialPassword: string;
}) {
  return (
    <div className="space-y-6">
      {accounts.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No staff login yet. Staff can&apos;t open coupons at this venue until you create one.
        </p>
      ) : (
        <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </ul>
      )}
      <CreateLoginForm venueId={venueId} initialPassword={initialPassword} />
    </div>
  );
}

function AccountRow({ account }: { account: VenueAccount }) {
  const [resetting, setResetting] = useState(false);
  const [toggling, startToggle] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Rendered on the client so "locked" is judged against the current time.
  const locked = account.locked_until !== null && new Date(account.locked_until) > new Date();

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-medium">{account.login_id}</p>
          <p className="mt-0.5 text-xs text-ink-600">
            {account.is_active ? "Active" : "Turned off"}
            {locked && <span className="text-red-700"> · Locked after wrong passwords</span>}
            {" · "}
            {account.last_login_at ? `Last login ${dateFormat.format(new Date(account.last_login_at))}` : "Never logged in"}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass("secondary", "px-3 py-1.5")} onClick={() => setResetting((v) => !v)}>
            {resetting ? "Cancel" : "New password"}
          </button>
          <button
            type="button"
            disabled={toggling}
            className={buttonClass(account.is_active ? "danger" : "secondary", "px-3 py-1.5")}
            onClick={() =>
              startToggle(async () => {
                const result = await setVenueLoginActive(account.id, !account.is_active);
                setToggleError(result.error ?? null);
              })
            }
          >
            {account.is_active ? "Turn off" : "Turn on"}
          </button>
        </div>
      </div>
      {toggleError && <p className="mt-2 text-sm text-red-700">{toggleError}</p>}
      {resetting && <ResetPasswordForm accountId={account.id} />}
    </li>
  );
}

function ResetPasswordForm({ accountId }: { accountId: string }) {
  const [state, formAction, pending] = useActionState(resetVenuePassword.bind(null, accountId), {});
  // Only rendered after a click, never on the server, so generating here is safe.
  const [password, setPassword] = useState(generatePassword);

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg bg-ink-50 p-3">
      <FormMessage state={state} />
      <PasswordField password={password} setPassword={setPassword} errors={state.fieldErrors?.password} />
      <SubmitButton pending={pending}>Set new password</SubmitButton>
    </form>
  );
}

function CreateLoginForm({ venueId, initialPassword }: { venueId: string; initialPassword: string }) {
  const [state, formAction, pending] = useActionState(createVenueLogin.bind(null, venueId), {});
  const [password, setPassword] = useState(initialPassword);

  return (
    <form action={formAction} className="space-y-3">
      <h3 className="text-sm font-semibold">Add a staff login</h3>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Login ID" name="login_id" errors={state.fieldErrors?.login_id} hint="e.g. rooftop-silom">
          <input id="login_id" name="login_id" autoComplete="off" required className={`${inputClass} font-mono`} />
        </Field>
        <PasswordField password={password} setPassword={setPassword} errors={state.fieldErrors?.password} />
      </div>
      <SubmitButton pending={pending}>Create login</SubmitButton>
    </form>
  );
}

function PasswordField({
  password,
  setPassword,
  errors,
}: {
  password: string;
  setPassword: (value: string) => void;
  errors?: string[];
}) {
  return (
    <Field label="Password" name="password" errors={errors} hint="Copy this and give it to the venue. It's not shown again.">
      <div className="flex gap-2">
        <input
          id="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className={`${inputClass} font-mono`}
        />
        <button type="button" className={buttonClass("secondary", "shrink-0 px-3")} onClick={() => setPassword(generatePassword())}>
          New
        </button>
      </div>
    </Field>
  );
}
