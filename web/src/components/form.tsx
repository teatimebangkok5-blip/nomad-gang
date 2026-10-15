import type { ReactNode } from "react";
import type { FormState } from "@/lib/types";

export const inputClass =
  "block w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-xs " +
  "placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none " +
  "disabled:bg-ink-100";

export function Field({
  label,
  name,
  hint,
  errors,
  children,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink-800">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {errors?.map((error) => (
        <p key={error} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ))}
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        {state.message}
      </p>
    );
  }
  return null;
}

const buttonVariants = {
  primary: "bg-brand-500 text-ink-900 hover:bg-brand-600 disabled:bg-brand-100 disabled:text-ink-500",
  secondary: "border border-ink-300 bg-white text-ink-800 hover:bg-ink-50 disabled:text-ink-400",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300",
};

export function buttonClass(variant: keyof typeof buttonVariants = "primary", extra = "") {
  return (
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium " +
    `transition-colors disabled:cursor-not-allowed ${buttonVariants[variant]} ${extra}`
  );
}

export function SubmitButton({
  pending,
  children,
  variant = "primary",
  className = "",
}: {
  pending: boolean;
  children: ReactNode;
  variant?: keyof typeof buttonVariants;
  className?: string;
}) {
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, className)}>
      {pending ? "Saving…" : children}
    </button>
  );
}
