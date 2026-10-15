import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">TableMeet</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-900">Admin sign in</h1>
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
