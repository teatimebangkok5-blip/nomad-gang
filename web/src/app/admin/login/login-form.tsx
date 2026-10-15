"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "./actions";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/form";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {});
  const notAdmin = useSearchParams().get("error") === "not_admin";

  return (
    <form action={action} className="space-y-4">
      {notAdmin && !state.error && <FormMessage state={{ error: "This account is not an admin." }} />}
      <FormMessage state={state} />
      <Field label="Email" name="email" errors={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" name="password" errors={state.fieldErrors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton pending={pending} className="w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
